import pool from "../config/database.js";
import { parsePaging, buildWhere } from "../helpers/adminQuery.helper.js";
import { sendEmail, buildAnnouncementHtml } from "../helpers/email.helper.js";

/**
 * Admin events + ticket types.
 *
 * Events carry the pricing-rule columns (gst_percent, convenience_fee_percent,
 * convenience_fee_flat, gst_inclusive) so the admin can configure the dynamic
 * pricing engine. Ticket types are soft-deleted (status = 0).
 */

/* Columns the admin may write on an event (everything else is server-owned). */
const EVENT_WRITABLE = [
  "title", "description", "venue", "start_datetime", "end_datetime",
  "banner_url", "banner_url_mobile", "cart_url", "category_id", "organizer_id", "is_active", "approval_status",
  "gst_percent", "convenience_fee_percent", "convenience_fee_flat", "gst_inclusive"
];

const TICKET_WRITABLE = [
  "name", "description", "price", "total_quantity",
  "sale_start", "sale_end", "image", "status", "gst_percent", "max_per_user",
  "seating_mode"
];

/** Keeps only whitelisted keys that were actually provided. */
const pick = (body, allowed) => {
  const out = {};
  for (const k of allowed) {
    if (body[k] !== undefined) out[k] = body[k] === "" ? null : body[k];
  }
  return out;
};

/* --------------------------------- events --------------------------------- */

export const listEventsService = async (q = {}) => {
  const { limit, offset } = parsePaging(q);
  const { whereSql, params } = buildWhere([
    q.search ? { sql: "(e.title LIKE ? OR e.venue LIKE ?)", params: [`%${q.search}%`, `%${q.search}%`] } : null,
    { sql: "e.is_active = ?", value: q.status },
    { sql: "e.approval_status = ?", value: q.approval_status },
    { sql: "e.category_id = ?", value: q.category_id },
    { sql: "e.start_datetime >= ?", value: q.from },
    { sql: "e.start_datetime <= ?", value: q.to }
  ]);

  const [rows] = await pool.query(
    `SELECT e.id, e.title, e.venue, e.start_datetime, e.end_datetime,
            e.banner_url, e.category_id, c.name AS category_name,
            e.approval_status, e.is_active,
            e.gst_percent, e.convenience_fee_percent, e.convenience_fee_flat, e.gst_inclusive,
            e.created_at,
            (SELECT COUNT(*) FROM ticket_types tt WHERE tt.event_id = e.id AND tt.status = 1) AS ticket_type_count
     FROM events e
     LEFT JOIN event_categories c ON c.id = e.category_id
     ${whereSql}
     ORDER BY e.start_datetime DESC, e.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM events e ${whereSql}`,
    params
  );

  return { rows, total, limit, offset };
};

export const getEventService = async (id) => {
  const [[event]] = await pool.query(
    `SELECT e.*, c.name AS category_name
     FROM events e
     LEFT JOIN event_categories c ON c.id = e.category_id
     WHERE e.id = ? LIMIT 1`,
    [id]
  );
  if (!event) throw new Error("Event not found");

  const [ticket_types] = await pool.query(
    `SELECT id, name, description, price, total_quantity, sold_quantity,
            sale_start, sale_end, image, status, gst_percent, max_per_user, seating_mode,
            (SELECT COUNT(*) FROM seats s WHERE s.ticket_type_id = ticket_types.id AND s.status = 1) AS seat_count
     FROM ticket_types WHERE event_id = ? ORDER BY id ASC`,
    [id]
  );
  const [gallery] = await pool.query(
    `SELECT id, image_url, caption, sort_order, status
     FROM event_gallery WHERE event_id = ? ORDER BY sort_order ASC, id ASC`,
    [id]
  );
  const [artists] = await pool.query(
    `SELECT id, name, image_url, role, sort_order, status
     FROM event_artists WHERE event_id = ? ORDER BY sort_order ASC, id ASC`,
    [id]
  );

  return { event, ticket_types, gallery, artists };
};

export const createEventService = async (body) => {
  if (!body.title) throw new Error("title is required");
  const data = pick(body, EVENT_WRITABLE);
  if (!cols_has(data, "title")) data.title = body.title;

  // events.organizer_id is a NOT NULL FK → organizers(id). Default to the first
  // organizer when the client didn't pick one, so creation never violates the FK.
  if (data.organizer_id == null) {
    const [[org]] = await pool.query(`SELECT id FROM organizers ORDER BY id ASC LIMIT 1`);
    if (!org) throw new Error("No organizer exists. Create an organizer before adding events.");
    data.organizer_id = org.id;
  }

  const cols = Object.keys(data);
  const placeholders = cols.map(() => "?").join(", ");
  const [res] = await pool.query(
    `INSERT INTO events (${cols.join(", ")}) VALUES (${placeholders})`,
    cols.map((c) => data[c])
  );
  return { id: res.insertId };
};

const cols_has = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);

export const updateEventService = async (id, body) => {
  const data = pick(body, EVENT_WRITABLE);
  const cols = Object.keys(data);
  if (!cols.length) throw new Error("No updatable fields provided");
  const setSql = cols.map((c) => `${c} = ?`).join(", ");
  const [res] = await pool.query(
    `UPDATE events SET ${setSql} WHERE id = ?`,
    [...cols.map((c) => data[c]), id]
  );
  if (res.affectedRows === 0) throw new Error("Event not found");
  return { id: Number(id), updated: true };
};

export const setEventStatusService = async (id, { is_active, approval_status }) => {
  const sets = [];
  const params = [];
  if (is_active !== undefined) { sets.push("is_active = ?"); params.push(Number(is_active) ? 1 : 0); }
  if (approval_status !== undefined) { sets.push("approval_status = ?"); params.push(approval_status); }
  if (!sets.length) throw new Error("Nothing to update");
  const [res] = await pool.query(
    `UPDATE events SET ${sets.join(", ")} WHERE id = ?`,
    [...params, id]
  );
  if (res.affectedRows === 0) throw new Error("Event not found");
  return { id: Number(id), is_active, approval_status };
};

/* ------------------------------ ticket types ------------------------------ */

export const listTicketTypesService = async (eventId) => {
  const [rows] = await pool.query(
    `SELECT id, event_id, name, description, price, total_quantity, sold_quantity,
            sale_start, sale_end, image, status, gst_percent, max_per_user
     FROM ticket_types WHERE event_id = ? ORDER BY id ASC`,
    [eventId]
  );
  return rows;
};

export const createTicketTypeService = async (eventId, body) => {
  if (!body.name) throw new Error("name is required");
  if (body.price === undefined) throw new Error("price is required");
  const data = pick(body, TICKET_WRITABLE);
  data.name = body.name;
  data.price = body.price;
  if (data.status === undefined || data.status === null) data.status = 1;
  const cols = ["event_id", ...Object.keys(data)];
  const placeholders = cols.map(() => "?").join(", ");
  const [res] = await pool.query(
    `INSERT INTO ticket_types (${cols.join(", ")}) VALUES (${placeholders})`,
    [eventId, ...Object.keys(data).map((c) => data[c])]
  );
  return { id: res.insertId };
};

export const updateTicketTypeService = async (id, body) => {
  const data = pick(body, TICKET_WRITABLE);
  const cols = Object.keys(data);
  if (!cols.length) throw new Error("No updatable fields provided");
  const setSql = cols.map((c) => `${c} = ?`).join(", ");
  const [res] = await pool.query(
    `UPDATE ticket_types SET ${setSql} WHERE id = ?`,
    [...cols.map((c) => data[c]), id]
  );
  if (res.affectedRows === 0) throw new Error("Ticket type not found");
  return { id: Number(id), updated: true };
};

export const deleteTicketTypeService = async (id) => {
  await pool.query(`UPDATE ticket_types SET status = 0 WHERE id = ?`, [id]);
  return { id: Number(id), deleted: true };
};

/* -------------------------------- seats ----------------------------------- */

/** Default row labels A, B, … Z, AA, AB … for a given count. */
const buildRowLabels = (rows, provided) => {
  if (Array.isArray(provided) && provided.length >= rows) {
    return provided.slice(0, rows).map((r) => String(r).trim().toUpperCase());
  }
  const labels = [];
  for (let i = 0; i < rows; i++) {
    let n = i, label = "";
    do {
      label = String.fromCharCode(65 + (n % 26)) + label;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    labels.push(label);
  }
  return labels;
};

/** Count of this ticket type's seats currently held by a live order. */
const bookedSeatCount = async (db, ticketTypeId) => {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS n
     FROM order_seats os
     JOIN orders o ON o.id = os.order_id
     WHERE os.ticket_type_id = ?
       AND ( o.status = 'PAID'
             OR (o.status = 'HOLD' AND o.hold_expires_at > NOW()) )`,
    [ticketTypeId]
  );
  return Number(row.n) || 0;
};

/**
 * (Re)generates the seat grid for a ticket type from rows × cols and switches
 * it to SEATED. Refuses if any seat is already booked by a live order (so we
 * never strand a paying customer's seat). Sets total_quantity = seat count.
 */
export const generateSeatsService = async (ticketTypeId, { rows, cols, rowLabels } = {}) => {
  const r = parseInt(rows, 10);
  const c = parseInt(cols, 10);
  if (!Number.isInteger(r) || r <= 0 || !Number.isInteger(c) || c <= 0) {
    throw new Error("rows and cols must be positive integers");
  }
  if (r * c > 5000) throw new Error("Too many seats (max 5000)");

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[tt]] = await conn.query(
      `SELECT id, event_id FROM ticket_types WHERE id = ? FOR UPDATE`,
      [ticketTypeId]
    );
    if (!tt) throw new Error("Ticket type not found");

    if (await bookedSeatCount(conn, ticketTypeId) > 0) {
      throw new Error("Seats are already booked — cannot regenerate the grid");
    }

    // Clear any previous (unbooked) layout, then bulk-insert the fresh grid.
    await conn.query(`DELETE FROM seats WHERE ticket_type_id = ?`, [ticketTypeId]);

    const labels = buildRowLabels(r, rowLabels);
    const values = [];
    const params = [];
    for (let ri = 0; ri < r; ri++) {
      for (let ci = 1; ci <= c; ci++) {
        values.push("(?, ?, ?, ?, ?, 1)");
        params.push(tt.event_id, ticketTypeId, `${labels[ri]}${ci}`, labels[ri], ci);
      }
    }
    await conn.query(
      `INSERT INTO seats (event_id, ticket_type_id, seat_label, row_label, col_number, status)
       VALUES ${values.join(", ")}`,
      params
    );

    await conn.query(
      `UPDATE ticket_types SET seating_mode = 'SEATED', total_quantity = ? WHERE id = ?`,
      [r * c, ticketTypeId]
    );

    await conn.commit();
    return { ticketTypeId: Number(ticketTypeId), rows: r, cols: c, total: r * c };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/**
 * Parses one "Blocks" cell (e.g. "1-5|6-14|15-23") into an array of blocks,
 * each block an array of seat numbers. `|` separates blocks (aisle gaps),
 * `-` is an inclusive range, a bare number is a single seat.
 */
const parseBlocks = (cell) => {
  const blocks = [];
  for (const part of String(cell).split("|")) {
    const seg = part.trim();
    if (!seg) continue;
    const m = seg.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      let [, a, b] = m;
      a = parseInt(a, 10); b = parseInt(b, 10);
      if (a > b) [a, b] = [b, a];
      const nums = [];
      for (let n = a; n <= b; n++) nums.push(n);
      blocks.push(nums);
    } else if (/^\d+$/.test(seg)) {
      blocks.push([parseInt(seg, 10)]);
    } else {
      throw new Error(`Invalid seat block "${seg}"`);
    }
  }
  if (!blocks.length) throw new Error("A row has no seats");
  return blocks;
};

/**
 * Imports a whole-event seating layout from CSV. Columns: Section, Row, Blocks.
 * Section = an existing ticket-type NAME; Row = a row label; Blocks = seat
 * groups split by "|" with an aisle gap between them (default 1 column).
 *
 * seat_label keeps the CSV's seat number (so the sequence is whatever the file
 * says); col_number is the PHYSICAL position including aisle columns, so gaps in
 * col_number render as aisles on the chart. Replaces all seats of every
 * referenced ticket type and switches them to SEATED. Refuses if a referenced
 * type has live booked seats.
 */
export const importSeatLayoutService = async (eventId, csvText, { aisle = 1 } = {}) => {
  const aisleWidth = Math.max(0, parseInt(aisle, 10) || 0);
  if (!csvText || !String(csvText).trim()) throw new Error("CSV is empty");

  // 1) Parse CSV lines → { section, row, blocks }
  const lines = String(csvText).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) throw new Error("CSV has no rows");
  // drop an optional header line
  if (/^section\s*,/i.test(lines[0])) lines.shift();

  const parsed = [];
  lines.forEach((line, i) => {
    // Blocks may contain commas? No — we split on the first two commas only.
    const firstComma = line.indexOf(",");
    const secondComma = line.indexOf(",", firstComma + 1);
    if (firstComma < 0 || secondComma < 0) {
      throw new Error(`Line ${i + 1}: expected "Section,Row,Blocks"`);
    }
    const section = line.slice(0, firstComma).trim();
    const row = line.slice(firstComma + 1, secondComma).trim();
    const blocksCell = line.slice(secondComma + 1).trim();
    if (!section || !row || !blocksCell) throw new Error(`Line ${i + 1}: missing Section/Row/Blocks`);
    parsed.push({ section, row: row.toUpperCase(), blocks: parseBlocks(blocksCell), lineNo: i + 1 });
  });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 2) name → ticket_type_id (case-insensitive) for this event
    const [types] = await conn.query(
      `SELECT id, name FROM ticket_types WHERE event_id = ? AND status = 1 FOR UPDATE`,
      [eventId]
    );
    if (!types.length) throw new Error("This event has no ticket types yet");
    const byName = new Map(types.map((t) => [String(t.name).trim().toLowerCase(), t.id]));

    const referenced = new Set();
    for (const p of parsed) {
      const id = byName.get(p.section.toLowerCase());
      if (!id) throw new Error(`Line ${p.lineNo}: no ticket type named "${p.section}"`);
      p.ticketTypeId = id;
      referenced.add(id);
    }

    // 3) refuse if any referenced type has live booked seats
    for (const ttId of referenced) {
      if ((await bookedSeatCount(conn, ttId)) > 0) {
        const nm = types.find((t) => t.id === ttId)?.name || ttId;
        throw new Error(`"${nm}" has booked seats — cannot re-import its layout`);
      }
    }

    // 4) clear referenced types' seats, then bulk-insert the parsed layout
    for (const ttId of referenced) {
      await conn.query(`DELETE FROM seats WHERE ticket_type_id = ?`, [ttId]);
    }

    const values = [];
    const params = [];
    const seen = new Set(); // (ttId|label) duplicate guard
    for (const p of parsed) {
      let physCol = 1;
      p.blocks.forEach((block, bi) => {
        for (const n of block) {
          const label = `${p.row}${n}`;
          const key = `${p.ticketTypeId}|${label}`;
          if (seen.has(key)) throw new Error(`Duplicate seat ${label} in section "${p.section}"`);
          seen.add(key);
          values.push("(?, ?, ?, ?, ?, 1)");
          params.push(eventId, p.ticketTypeId, label, p.row, physCol);
          physCol++;
        }
        if (bi < p.blocks.length - 1) physCol += aisleWidth; // aisle gap
      });
    }
    if (!values.length) throw new Error("No seats parsed from the CSV");

    await conn.query(
      `INSERT INTO seats (event_id, ticket_type_id, seat_label, row_label, col_number, status)
       VALUES ${values.join(", ")}`,
      params
    );

    // 5) mark referenced types SEATED with the right capacity
    const summary = [];
    for (const ttId of referenced) {
      const [[{ c }]] = await conn.query(
        `SELECT COUNT(*) AS c FROM seats WHERE ticket_type_id = ? AND status = 1`,
        [ttId]
      );
      await conn.query(
        `UPDATE ticket_types SET seating_mode = 'SEATED', total_quantity = ? WHERE id = ?`,
        [c, ttId]
      );
      summary.push({ section: types.find((t) => t.id === ttId)?.name, ticketTypeId: ttId, seats: c });
    }

    await conn.commit();
    return { eventId: Number(eventId), total: values.length, sections: summary };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/** All seats of a ticket type with a `booked` flag (admin preview). */
export const listSeatsService = async (ticketTypeId) => {
  const [rows] = await pool.query(
    `SELECT s.id, s.seat_label, s.row_label, s.col_number, s.status,
            EXISTS(
              SELECT 1 FROM order_seats os
              JOIN orders o ON o.id = os.order_id
              WHERE os.seat_id = s.id
                AND ( o.status = 'PAID'
                      OR (o.status = 'HOLD' AND o.hold_expires_at > NOW()) )
            ) AS booked
     FROM seats s
     WHERE s.ticket_type_id = ?
     ORDER BY s.row_label ASC, s.col_number ASC`,
    [ticketTypeId]
  );
  return rows.map((r) => ({ ...r, booked: Boolean(Number(r.booked)) }));
};

/**
 * Enables/disables a single seat (e.g. mark an aisle or hold a seat back).
 * Refuses to disable a seat held by a live order. Keeps total_quantity in sync
 * with the active seat count.
 */
export const toggleSeatStatusService = async (seatId, status) => {
  const newStatus = Number(status) ? 1 : 0;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[seat]] = await conn.query(
      `SELECT id, ticket_type_id FROM seats WHERE id = ? FOR UPDATE`,
      [seatId]
    );
    if (!seat) throw new Error("Seat not found");

    if (newStatus === 0) {
      const [[live]] = await conn.query(
        `SELECT COUNT(*) AS n FROM order_seats os
         JOIN orders o ON o.id = os.order_id
         WHERE os.seat_id = ?
           AND ( o.status = 'PAID'
                 OR (o.status = 'HOLD' AND o.hold_expires_at > NOW()) )`,
        [seatId]
      );
      if (Number(live.n) > 0) throw new Error("Seat is booked — cannot disable");
    }

    await conn.query(`UPDATE seats SET status = ? WHERE id = ?`, [newStatus, seatId]);
    await conn.query(
      `UPDATE ticket_types SET total_quantity =
         (SELECT COUNT(*) FROM seats WHERE ticket_type_id = ? AND status = 1)
       WHERE id = ?`,
      [seat.ticket_type_id, seat.ticket_type_id]
    );

    await conn.commit();
    return { seatId: Number(seatId), status: newStatus };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/**
 * General seat edit: relabel / move (seat_label, row_label, col_number) and/or
 * enable-disable (status). A booked/held seat is locked — it can't be relabelled,
 * moved or disabled. seat_label stays unique within its ticket type.
 */
export const updateSeatService = async (seatId, { seat_label, row_label, col_number, status } = {}) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[seat]] = await conn.query(
      `SELECT id, ticket_type_id, seat_label FROM seats WHERE id = ? FOR UPDATE`,
      [seatId]
    );
    if (!seat) throw new Error("Seat not found");

    const [[live]] = await conn.query(
      `SELECT COUNT(*) AS n FROM order_seats os
       JOIN orders o ON o.id = os.order_id
       WHERE os.seat_id = ?
         AND ( o.status = 'PAID'
               OR (o.status = 'HOLD' AND o.hold_expires_at > NOW()) )`,
      [seatId]
    );
    const isBooked = Number(live.n) > 0;

    const wantsRelabel =
      (seat_label !== undefined && String(seat_label).trim() !== seat.seat_label) ||
      row_label !== undefined ||
      col_number !== undefined;
    const wantsDisable = status !== undefined && Number(status) === 0;
    if (isBooked && (wantsRelabel || wantsDisable)) {
      throw new Error("Seat is booked — cannot edit or disable");
    }

    const sets = [];
    const params = [];
    if (seat_label !== undefined) {
      const label = String(seat_label).trim();
      if (!label) throw new Error("Seat label cannot be empty");
      const [[dup]] = await conn.query(
        `SELECT id FROM seats WHERE ticket_type_id = ? AND seat_label = ? AND id <> ? LIMIT 1`,
        [seat.ticket_type_id, label, seatId]
      );
      if (dup) throw new Error(`Seat label "${label}" already exists in this ticket type`);
      sets.push("seat_label = ?"); params.push(label);
    }
    if (row_label !== undefined) { sets.push("row_label = ?"); params.push(String(row_label).trim()); }
    if (col_number !== undefined) { sets.push("col_number = ?"); params.push(Number(col_number) || 0); }
    if (status !== undefined) { sets.push("status = ?"); params.push(Number(status) ? 1 : 0); }
    if (!sets.length) throw new Error("Nothing to update");

    await conn.query(`UPDATE seats SET ${sets.join(", ")} WHERE id = ?`, [...params, seatId]);

    // Keep the ticket type's quantity in sync with its active seats.
    if (status !== undefined) {
      await conn.query(
        `UPDATE ticket_types SET total_quantity =
           (SELECT COUNT(*) FROM seats WHERE ticket_type_id = ? AND status = 1)
         WHERE id = ?`,
        [seat.ticket_type_id, seat.ticket_type_id]
      );
    }

    await conn.commit();
    return { seatId: Number(seatId), updated: true };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/**
 * Renames an entire seat row for a ticket type (e.g. "C" -> "CD"), rebuilding
 * each seat_label as <newRow><col_number> (C1 -> CD1, C2 -> CD2 ...).
 * Blocked if the target row already exists or any seat in the source row is booked.
 */
export const renameSeatRowService = async (typeId, fromRaw, toRaw) => {
  const from = String(fromRaw ?? "").trim();
  const to = String(toRaw ?? "").trim();
  if (!from || !to) throw new Error("Both current and new row names are required");
  if (from === to) throw new Error("New row name is the same as the current one");

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [src] = await conn.query(
      `SELECT id FROM seats WHERE ticket_type_id = ? AND row_label = ? FOR UPDATE`,
      [typeId, from]
    );
    if (!src.length) throw new Error(`Row "${from}" has no seats`);

    const [[dst]] = await conn.query(
      `SELECT COUNT(*) AS n FROM seats WHERE ticket_type_id = ? AND row_label = ?`,
      [typeId, to]
    );
    if (Number(dst.n) > 0) throw new Error(`Row "${to}" already exists`);

    const [[booked]] = await conn.query(
      `SELECT COUNT(*) AS n FROM order_seats os
       JOIN orders o ON o.id = os.order_id
       JOIN seats s ON s.id = os.seat_id
       WHERE s.ticket_type_id = ? AND s.row_label = ?
         AND ( o.status = 'PAID'
               OR (o.status = 'HOLD' AND o.hold_expires_at > NOW()) )`,
      [typeId, from]
    );
    if (Number(booked.n) > 0) throw new Error("Row has booked seats — cannot rename");

    const [res] = await conn.query(
      `UPDATE seats SET row_label = ?, seat_label = CONCAT(?, col_number)
       WHERE ticket_type_id = ? AND row_label = ?`,
      [to, to, typeId, from]
    );

    await conn.commit();
    return { from, to, renamed: res.affectedRows };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/* --------------------- broadcast email to attendees ----------------------- */

// Ticket statuses that map to each event-scoped audience.
const AUDIENCE_TICKET_STATUS = {
  booked: ["BOOKED"],
  cancelled: ["CANCELLED"],
  both: ["BOOKED", "CANCELLED"],
};

/**
 * Distinct {email, name} recipients for an email broadcast.
 *  - 'booked'    : holders of a BOOKED ticket for this event (default)
 *  - 'cancelled' : holders of a CANCELLED ticket for this event
 *  - 'both'      : BOOKED + CANCELLED ticket holders for this event
 *  - 'all'       : every active user in the system (NOT event-scoped)
 */
export const getEventAttendeesService = async (eventId, audience = "booked") => {
  if (audience === "all") {
    const [rows] = await pool.query(
      `SELECT DISTINCT email, name
       FROM users
       WHERE status = 1 AND email IS NOT NULL AND email <> ''`
    );
    return rows;
  }

  const statuses = AUDIENCE_TICKET_STATUS[audience] || AUDIENCE_TICKET_STATUS.booked;
  const placeholders = statuses.map(() => "?").join(", ");
  const [rows] = await pool.query(
    `SELECT DISTINCT eud.email, eud.name
     FROM tickets t
     JOIN event_user_detail eud
       ON eud.user_id = t.user_id AND eud.event_id = t.event_id AND eud.status = 1
     WHERE t.event_id = ? AND t.status IN (${placeholders})
       AND eud.email IS NOT NULL AND eud.email <> ''`,
    [eventId, ...statuses]
  );
  return rows;
};

/**
 * Sends a branded announcement email (subject + free-text message) to every
 * booked attendee of an event. Individual emails (privacy-safe), small batches
 * so we don't hammer SMTP. Returns { total, sent, failed }.
 */
export const broadcastEventEmailService = async (eventId, { subject, message, audience = "booked" } = {}) => {
  if (!subject?.trim() || !message?.trim()) {
    throw new Error("Subject and message are required");
  }
  const [[event]] = await pool.query(
    `SELECT title, banner_url, venue, start_datetime FROM events WHERE id = ?`,
    [eventId]
  );
  if (!event) throw new Error("Event not found");

  const recipients = await getEventAttendeesService(eventId, audience);
  if (!recipients.length) throw new Error("No recipients with an email for this selection");

  let sent = 0;
  let failed = 0;
  const BATCH = 5;
  for (let i = 0; i < recipients.length; i += BATCH) {
    const batch = recipients.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map((r) =>
        sendEmail({
          to: r.email,
          subject: subject.trim(),
          html: buildAnnouncementHtml({ subject, message }),
          text: message,
          meta: { type: "broadcast", eventId: Number(eventId) },
        })
      )
    );
    results.forEach((ok) => (ok ? sent++ : failed++));
  }

  return { total: recipients.length, sent, failed };
};

/* ----------------------------- categories (ref) --------------------------- */

export const listCategoriesService = async () => {
  const [rows] = await pool.query(
    `SELECT id, name, image, status FROM event_categories ORDER BY name ASC`
  );
  return rows;
};

export const listOrganizersService = async () => {
  const [rows] = await pool.query(
    `SELECT o.id, o.organization_name, o.kyc_status, u.name AS user_name, u.mobile
     FROM organizers o
     LEFT JOIN users u ON u.id = o.user_id
     ORDER BY o.id ASC`
  );
  return rows;
};
