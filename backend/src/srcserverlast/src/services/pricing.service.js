import pool from "../config/database.js";

/**
 * Single source of truth for order pricing.
 *
 * Used by BOTH /order/quote (read-only, no lock) and /order/create-order
 * (inside the order transaction, lock = true). The frontend renders whatever
 * this returns — so the displayed total, the charged total and the stored
 * total are always identical.
 *
 * Rules are dynamic and OPTIONAL:
 *   - GST %     : ticket_type.gst_percent ?? event.gst_percent ?? 0
 *   - fee       : event.convenience_fee_flat + event.convenience_fee_percent
 *   - discount  : coupon (scope by event / ticket type)
 * If an admin has configured none of these, everything is 0 → plain amount.
 *
 * Money is DECIMAL rupees here; convert to paise only at the gateway boundary.
 */

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Hard safety cap on reserved seats in a single order, independent of a ticket
// type's max_per_user (which may be NULL = unlimited). Stops one request from
// locking/booking a whole venue. Override via env MAX_SEATS_PER_ORDER.
const MAX_SEATS_PER_ORDER = Number(process.env.MAX_SEATS_PER_ORDER) || 10;

const num = (v) => (v === null || v === undefined ? null : Number(v));

/* ------------------------------- data loads -------------------------------- */

const loadEvent = async (db, eventId) => {
  const [[event]] = await db.query(
    `SELECT id, is_active, approval_status, start_datetime,
            gst_percent, convenience_fee_percent, convenience_fee_flat, gst_inclusive
     FROM events WHERE id = ?`,
    [eventId]
  );
  return event || null;
};

const loadTicketType = async (db, ticketTypeId, eventId, lock) => {
  const [[tt]] = await db.query(
    `SELECT id, name, price, total_quantity, status, gst_percent, sale_start, sale_end, max_per_user, seating_mode
     FROM ticket_types
     WHERE id = ? AND event_id = ? ${lock ? "FOR UPDATE" : ""}`,
    [ticketTypeId, eventId]
  );
  return tt || null;
};

/**
 * Loads the requested seats for a SEATED ticket type, validating that each one
 * exists, belongs to this ticket type and is active. When `lock` is true the
 * rows are taken FOR UPDATE so a concurrent order blocks until we commit
 * (prevents double-booking). Throws if any seat id is unknown/foreign/disabled.
 */
const loadRequestedSeats = async (db, ticketTypeId, seatIds, lock) => {
  const ids = [...new Set(seatIds.map((s) => parseInt(s, 10)))];
  if (ids.length !== seatIds.length) throw new Error("Duplicate seats selected");

  const placeholders = ids.map(() => "?").join(",");
  const [rows] = await db.query(
    `SELECT id, seat_label
     FROM seats
     WHERE id IN (${placeholders}) AND ticket_type_id = ? AND status = 1
     ${lock ? "FOR UPDATE" : ""}`,
    [...ids, ticketTypeId]
  );
  if (rows.length !== ids.length) throw new Error("Invalid seat selection");
  return rows; // [{ id, seat_label }]
};

// Seats already held by a live order (PAID or unexpired HOLD). Mirrors the
// quantity liveness rule in usedQuantity(); expired holds free their seats.
const takenSeatLabels = async (db, seatRows) => {
  if (!seatRows.length) return [];
  const ids = seatRows.map((s) => s.id);
  const placeholders = ids.map(() => "?").join(",");
  const [rows] = await db.query(
    `SELECT s.seat_label
     FROM order_seats os
     JOIN seats s  ON s.id = os.seat_id
     JOIN orders o ON o.id = os.order_id
     WHERE os.seat_id IN (${placeholders})
       AND ( o.status = 'PAID'
             OR (o.status = 'HOLD' AND o.hold_expires_at > NOW()) )`,
    ids
  );
  return rows.map((r) => r.seat_label);
};

// Seats consumed by live orders. Expired HOLDs are released (B2 fix).
const usedQuantity = async (db, ticketTypeId) => {
  const [[row]] = await db.query(
    `SELECT IFNULL(SUM(oi.quantity), 0) AS used
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE oi.ticket_type_id = ?
       AND ( o.status = 'PAID'
             OR (o.status = 'HOLD' AND o.hold_expires_at > NOW()) )`,
    [ticketTypeId]
  );
  return Number(row.used) || 0;
};

// Tickets of this type a given user already holds (live HOLD + PAID). The
// current create-order row contributes 0 here because its order_items are
// inserted AFTER pricing runs. Cancelled/expired orders are excluded, so a
// cancellation frees the user's quota.
const usedQuantityByUser = async (db, ticketTypeId, userId) => {
  const [[row]] = await db.query(
    `SELECT IFNULL(SUM(oi.quantity), 0) AS used
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE oi.ticket_type_id = ?
       AND o.user_id = ?
       AND ( o.status = 'PAID'
             OR (o.status = 'HOLD' AND o.hold_expires_at > NOW()) )`,
    [ticketTypeId, userId]
  );
  return Number(row.used) || 0;
};

/* --------------------------------- coupon ---------------------------------- */

const resolveCoupon = async (db, code, { eventId, userId, totalQty, subtotal }) => {
  if (!code) return null;

  const [[c]] = await db.query(
    `SELECT * FROM coupons WHERE code = ? AND status = 1`,
    [String(code).trim()]
  );
  if (!c) throw new Error("Invalid coupon code");

  const now = new Date();
  if (c.valid_from && now < new Date(c.valid_from)) throw new Error("Coupon not yet active");
  if (c.valid_to && now > new Date(c.valid_to)) throw new Error("Coupon has expired");
  if (c.event_id && Number(c.event_id) !== Number(eventId)) throw new Error("Coupon not valid for this event");
  if (totalQty < c.min_qty) throw new Error(`Coupon needs at least ${c.min_qty} ticket(s)`);
  if (subtotal < Number(c.min_amount)) throw new Error(`Coupon needs a minimum order of ₹${c.min_amount}`);

  if (c.usage_limit != null) {
    const [[u]] = await db.query(
      `SELECT COUNT(*) AS n FROM coupon_redemptions WHERE coupon_id = ?`,
      [c.id]
    );
    if (u.n >= c.usage_limit) throw new Error("Coupon usage limit reached");
  }
  if (userId) {
    const [[pu]] = await db.query(
      `SELECT COUNT(*) AS n FROM coupon_redemptions WHERE coupon_id = ? AND user_id = ?`,
      [c.id, userId]
    );
    if (pu.n >= c.per_user_limit) throw new Error("Coupon already used");
  }
  return c;
};

// Discount amount against the eligible base (whole subtotal, or one ticket type)
const couponDiscount = (coupon, lines, subtotal) => {
  if (!coupon) return 0;

  const eligible = coupon.ticket_type_id
    ? lines
        .filter((l) => Number(l.ticket_type_id) === Number(coupon.ticket_type_id))
        .reduce((s, l) => s + l.base, 0)
    : subtotal;

  if (eligible <= 0) return 0;

  let d =
    coupon.type === "PERCENT"
      ? (eligible * Number(coupon.value)) / 100
      : Number(coupon.value);

  if (coupon.max_discount != null) d = Math.min(d, Number(coupon.max_discount));
  return round2(Math.min(d, eligible));
};

/* ------------------------------ main entry --------------------------------- */

/**
 * @param {Object} opts
 * @param {number} opts.eventId
 * @param {Array}  opts.items     [{ ticketTypeId, quantity }]
 * @param {string} [opts.couponCode]
 * @param {number} [opts.userId]
 * @param {boolean}[opts.lock]     true inside the create-order txn (locks rows + enforces stock)
 * @param {Object} [opts.conn]     transaction connection (defaults to pool)
 * @returns {Promise<Object>} breakdown { subtotal, discount_amount, discount_code,
 *   convenience_fee, tax_percent, tax_amount, total, currency, coupon, lines[] }
 */
export const calculatePricing = async ({
  eventId,
  items,
  couponCode = null,
  userId = null,
  lock = false,
  conn = null
}) => {
  const db = conn || pool;

  if (!eventId || !Array.isArray(items) || items.length === 0) {
    throw new Error("eventId and at least one ticket are required");
  }

  const event = await loadEvent(db, eventId);
  if (!event) throw new Error("Event not found");
  if (!event.is_active || event.approval_status !== "APPROVED") {
    throw new Error("Event is not open for booking");
  }

  const eventGst = num(event.gst_percent);
  const gstInclusive = Number(event.gst_inclusive) === 1;
  const now = new Date();

  // 1) Per-line base + per-line GST %
  let subtotal = 0;
  let seatedSeatTotal = 0; // running count of reserved seats across the order
  const lines = [];
  for (const it of items) {
    if (!it.ticketTypeId) throw new Error("Invalid ticket selection");

    const tt = await loadTicketType(db, it.ticketTypeId, eventId, lock);
    if (!tt || Number(tt.status) !== 1) throw new Error("Invalid ticket type");

    if (tt.sale_start && now < new Date(tt.sale_start)) throw new Error(`${tt.name}: sale not started`);
    if (tt.sale_end && now > new Date(tt.sale_end)) throw new Error(`${tt.name}: sale ended`);

    // SEATED types take a list of specific seats; quantity is the seat count.
    // GA types take a quantity, exactly as before.
    const isSeated = tt.seating_mode === "SEATED";
    let seatRows = null;
    let qty;

    if (isSeated) {
      const seatIds = Array.isArray(it.seatIds) ? it.seatIds : [];
      if (seatIds.length === 0) throw new Error(`${tt.name}: please select your seat(s)`);
      seatRows = await loadRequestedSeats(db, tt.id, seatIds, lock);
      qty = seatRows.length;

      // Safety cap — can't lock/book more than MAX_SEATS_PER_ORDER seats at once.
      seatedSeatTotal += qty;
      if (seatedSeatTotal > MAX_SEATS_PER_ORDER) {
        throw new Error(`You can book at most ${MAX_SEATS_PER_ORDER} seats per order`);
      }

      // Reject seats already held by a live order. Under lock the seat rows are
      // held FOR UPDATE, so a racing order blocks then sees our order_seats row.
      const taken = await takenSeatLabels(db, seatRows);
      if (taken.length) {
        throw new Error(
          `${tt.name}: seat${taken.length > 1 ? "s" : ""} ${taken.join(", ")} no longer available`
        );
      }
    } else {
      qty = parseInt(it.quantity, 10);
      if (!Number.isInteger(qty) || qty <= 0) throw new Error("Invalid ticket selection");

      if (lock) {
        const used = await usedQuantity(db, tt.id);
        const available = Number(tt.total_quantity) - used;
        if (qty > available) throw new Error(`${tt.name}: only ${Math.max(0, available)} left`);
      }
    }

    // Per-user cap (NULL = unlimited). Counts the user's existing live/paid
    // holds so it's cumulative across orders, not just per-cart.
    if (tt.max_per_user != null && userId) {
      const limit = Number(tt.max_per_user);
      const held = await usedQuantityByUser(db, tt.id, userId);
      if (held + qty > limit) {
        const canAdd = Math.max(0, limit - held);
        throw new Error(
          held > 0
            ? `${tt.name}: limit ${limit} per user — you already have ${held}, you can add ${canAdd} more`
            : `${tt.name}: limit ${limit} per user`
        );
      }
    }

    const unitPrice = round2(tt.price);
    const base = round2(unitPrice * qty);
    const gstPercent = num(tt.gst_percent) ?? eventGst ?? 0;

    subtotal += base;
    lines.push({
      ticket_type_id: tt.id,
      name: tt.name,
      quantity: qty,
      unit_price: unitPrice,
      gst_percent: gstPercent,
      base,
      seating_mode: tt.seating_mode,
      seat_ids: seatRows ? seatRows.map((s) => s.id) : null,
      seat_labels: seatRows ? seatRows.map((s) => s.seat_label) : null
    });
  }
  subtotal = round2(subtotal);
  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);

  // 2) Coupon discount (validated), distributed proportionally for tax math
  const coupon = await resolveCoupon(db, couponCode, { eventId, userId, totalQty, subtotal });
  const discountAmount = couponDiscount(coupon, lines, subtotal);

  // 3) Per-line discount + GST
  let taxAmount = 0;
  for (const l of lines) {
    l.discount_amount = subtotal > 0 ? round2((discountAmount * l.base) / subtotal) : 0;
    const taxable = round2(l.base - l.discount_amount);
    const g = Number(l.gst_percent) || 0;

    if (g > 0) {
      l.gst_amount = gstInclusive
        ? round2(taxable - taxable / (1 + g / 100)) // embedded
        : round2((taxable * g) / 100); // added on top
    } else {
      l.gst_amount = 0;
    }
    // line_total = what the customer pays for this line (tax added only if exclusive)
    l.line_total = round2(taxable + (gstInclusive ? 0 : l.gst_amount));
    taxAmount += l.gst_amount;
  }
  taxAmount = round2(taxAmount);

  // 4) Convenience fee (event config; none configured -> 0)
  const feePercent = num(event.convenience_fee_percent);
  const feeFlat = num(event.convenience_fee_flat);
  const taxableTotal = round2(subtotal - discountAmount);
  let convenienceFee = 0;
  if (feeFlat) convenienceFee += feeFlat;
  if (feePercent) convenienceFee += (taxableTotal * feePercent) / 100;
  convenienceFee = round2(convenienceFee);

  // 5) Grand total
  const total = round2(
    taxableTotal + (gstInclusive ? 0 : taxAmount) + convenienceFee
  );

  // representative order-level tax % (authoritative number is tax_amount)
  const taxPercent = eventGst ?? (lines.find((l) => l.gst_percent)?.gst_percent ?? 0);

  return {
    currency: "INR",
    subtotal,
    discount_code: coupon?.code || null,
    discount_amount: discountAmount,
    convenience_fee: convenienceFee,
    tax_percent: round2(taxPercent),
    tax_amount: taxAmount,
    gst_inclusive: gstInclusive,
    total,
    total_qty: totalQty,
    coupon: coupon ? { id: coupon.id, code: coupon.code } : null,
    lines
  };
};
