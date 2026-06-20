


import pool from "../config/database.js";
import crypto from "crypto";
import { sendTicketEmail, sendCancellationEmail } from "../helpers/email.helper.js";
import { requestRefundService } from "./refund.service.js";

export const createTicketService = async (orderId) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    /* 1️⃣ Lock & Fetch Order */
    const [[order]] = await conn.query(
      `SELECT * FROM orders 
       WHERE id = ? AND status = 'PAID'
       FOR UPDATE`,
      [orderId]
    );

    if (!order) {
      throw new Error("Order not found or not PAID");
    }

    /* 2️⃣ Check if ticket already generated */
    const [[existing]] = await conn.query(
      `SELECT id, qr_hash FROM tickets WHERE order_id = ?`,
      [orderId]
    );

    if (existing) {
      await conn.commit();
      return {
        ticketId: existing.id,
        qrHash: existing.qr_hash,
        alreadyGenerated: true
      };
    }

    /* 3️⃣ Get order_items */
    const [orderItems] = await conn.query(
      `SELECT ticket_type_id, quantity
       FROM order_items
       WHERE order_id = ?`,
      [orderId]
    );

    if (!orderItems.length) {
      throw new Error("No order items found");
    }

    /* 4️⃣ Calculate total tickets */
    const totalSlots = orderItems.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    /* 5️⃣ Generate ONE QR */
    const qrHash = crypto
      .createHash("sha256")
      .update(`ORDER-${orderId}`)
      .digest("hex");
      const qrCode =`ORDER-${orderId}`;
    /* 6️⃣ Insert into tickets table */
    const [ticketResult] = await conn.query(
      `
      INSERT INTO tickets (
        order_id,
        event_id,
        user_id,
        qr_hash,
        qr_code,
        status,
        available_ticket,
        used_ticket,
        created_at
      )
      VALUES (?, ?, ?, ?,?, 'BOOKED', ?, 0, NOW())
      `,
      [
        orderId,
        order.event_id,
        order.user_id,
        qrHash,qrCode,
        totalSlots
      ]
    );

    const ticketId = ticketResult.insertId;

    /* 7️⃣ Insert into ticket_numbers (per ticket_type) */
    for (const item of orderItems) {
      await conn.query(
        `
        INSERT INTO ticket_numbers (
          ticket_id,
          ticket_type_id,
          available,
          used,
          status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, 0, 1, NOW(), NOW())
        `,
        [
          ticketId,
          item.ticket_type_id,
          item.quantity
        ]
      );
    }

    await conn.commit();

    /* 8️⃣ Fire-and-forget confirmation email (never breaks ticket creation) */
    sendTicketConfirmation(orderId, order.event_id, order.user_id, {
      ticketId,
      qrCode,
      qrHash,
      totalSlots
    });

    return {
      success: true,
      ticketId,
      qrHash,
      totalSlots
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/**
 * Gathers event + booker contact details and emails the ticket.
 * Fully background-safe: swallows every error so it can never affect
 * the committed ticket transaction. Not awaited by the caller.
 */
const sendTicketConfirmation = async (orderId, eventId, userId, ticket) => {
  try {
    const [[event]] = await pool.query(
      `SELECT title, venue, start_datetime, end_datetime, banner_url
       FROM events WHERE id = ?`,
      [eventId]
    );

    const [[contact]] = await pool.query(
      `SELECT name, email, whatsapp_no
       FROM event_user_detail
       WHERE user_id = ? AND event_id = ? AND status = 1
       ORDER BY creation_time DESC, id DESC
       LIMIT 1`,
      [userId, eventId]
    );

    if (!contact?.email) {
      console.warn(`✉️  No contact email for order ${orderId} — skipping ticket email`);
      return;
    }

    /* Ticket-type breakdown with prices (Silver x2, Gold x1, …) + assigned seats */
    const [breakdown] = await pool.query(
      `SELECT tt.name,
              oi.quantity,
              tt.price        AS unit_price,
              oi.price        AS line_total,
              (SELECT GROUP_CONCAT(s.seat_label ORDER BY s.row_label, s.col_number SEPARATOR ', ')
                 FROM order_seats os
                 JOIN seats s ON s.id = os.seat_id
                WHERE os.order_id = oi.order_id AND os.ticket_type_id = oi.ticket_type_id) AS seats
       FROM order_items oi
       JOIN ticket_types tt ON tt.id = oi.ticket_type_id
       WHERE oi.order_id = ?
       ORDER BY tt.price ASC`,
      [orderId]
    );

    await sendTicketEmail({
      contact,
      event,
      ticket,
      breakdown,
      meta: { orderId, eventId, userId }
    });
  } catch (err) {
    console.error(`❌ Ticket confirmation email failed (order ${orderId}):`, err.message);
  }
};

export const getTicketsByEventService = async (eventId) => {
    const [rows] = await pool.query(
        `
        SELECT * FROM tickets WHERE event_id = ?
        `,
        [eventId]
    );
    return rows;
};
export const getTicketByIdService = async (ticketId) => {
    const [rows] = await pool.query(
        `
        SELECT * FROM tickets WHERE id = ?
        `,
        [ticketId]
    );
    return rows[0];
};
export const updateTicketQuantityService = async (ticketId, quantity) => {
    await pool.query(
        `
        UPDATE tickets SET quantity = ? WHERE id = ?
        `,
        [quantity, ticketId]
    );
};

export const getMyTicketsService = async (userId, statuses = ["BOOKED", "USED", "CANCELLED"]) => {
  const list = Array.isArray(statuses) ? statuses : [statuses];
  const placeholders = list.map(() => "?").join(",");

  const [rows] = await pool.query(
    `
    SELECT
      t.id AS ticket_id,
      t.order_id,
      t.qr_hash,t.qr_code,
      t.status,
      e.title AS event_name,
      e.start_datetime,
      e.end_datetime,
      e.venue,
      e.cart_url AS image,

      o.status AS order_status,
      o.total_price AS order_total,

      (SELECT r.status      FROM refunds r WHERE r.order_id = t.order_id ORDER BY r.id DESC LIMIT 1) AS refund_status,
      (SELECT r.refund_amount FROM refunds r WHERE r.order_id = t.order_id ORDER BY r.id DESC LIMIT 1) AS refunded_amount,

      tt.id AS ticket_type_id,
      tt.name AS ticket_type_name,
      tt.image AS ticket_type_image,
      tt.price AS ticket_type_price,
      tt.seating_mode AS seating_mode,

      -- assigned seats for SEATED ticket types (NULL for GA)
      (SELECT GROUP_CONCAT(s.seat_label ORDER BY s.row_label, s.col_number SEPARATOR ', ')
         FROM order_seats os
         JOIN seats s ON s.id = os.seat_id
        WHERE os.order_id = t.order_id AND os.ticket_type_id = tt.id) AS seats,

      tn.available AS available_ticket,
      tn.used AS used_ticket

    FROM tickets t
    JOIN events e ON e.id = t.event_id
    LEFT JOIN orders o ON o.id = t.order_id
    JOIN ticket_numbers tn ON tn.ticket_id = t.id
    JOIN ticket_types tt ON tt.id = tn.ticket_type_id
    WHERE t.user_id = ? AND t.status IN (${placeholders})
    ORDER BY t.created_at DESC
    `,
    [userId, ...list]
  );

  return rows;
};



export const cancelTicketService = async (ticketId, userId) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[ticket]] = await conn.query(
      `
      SELECT status, used_ticket
      FROM tickets
      WHERE id = ? AND user_id = ?
      FOR UPDATE
      `,
      [ticketId, userId]
    );

    if (!ticket) throw new Error("Ticket not found");

    if (ticket.used_ticket > 0) {
      throw new Error("Used ticket cannot be cancelled");
    }

    await conn.query(
      `
      UPDATE tickets
      SET status = 'CANCELLED'
      WHERE id = ?
      `,
      [ticketId]
    );

    await conn.commit();

    return { ticketId, status: "CANCELLED" };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/**
 * Full cancellation flow: validates eligibility (DB-checked), initiates a
 * Razorpay refund for paid bookings, cancels the ticket + order (freeing the
 * seat) and emails a cancellation + refund confirmation.
 *
 * @returns {Promise<{ ticketId, status, refund }>}
 */
export const cancelTicketWithRefundService = async (ticketId, userId, reason = null) => {
  /* 1️⃣ Load + validate */
  const [[t]] = await pool.query(
    `SELECT t.id, t.order_id, t.user_id, t.status, t.event_id, t.used_ticket,
            o.status AS order_status, o.total_price AS order_total
     FROM tickets t
     LEFT JOIN orders o ON o.id = t.order_id
     WHERE t.id = ?`,
    [ticketId]
  );

  if (!t) throw new Error("Ticket not found");
  if (Number(t.user_id) !== Number(userId)) throw new Error("Not your ticket");
  if (t.status !== "BOOKED") throw new Error("Ticket is not active");
  if (t.used_ticket > 0) throw new Error("Already checked in — cannot cancel");

  const [[event]] = await pool.query(
    `SELECT title, venue, start_datetime, end_datetime, banner_url FROM events WHERE id = ?`,
    [t.event_id]
  );

  const cutoffH = Number(process.env.REFUND_CUTOFF_HOURS || 0);
  if (event?.start_datetime &&
      Date.now() > new Date(event.start_datetime).getTime() - cutoffH * 3600 * 1000) {
    throw new Error("Cancellation window has closed");
  }

  /* 2️⃣ Refund (paid bookings only) — throws on gateway failure, before we cancel.
     Free bookings (zero-total) have no gateway payment to refund, so we skip
     straight to cancellation. */
  let refund = null;
  const isPaidOrder =
    t.order_id && t.order_status === "PAID" && Number(t.order_total) > 0;
  if (isPaidOrder) {
    const r = await requestRefundService({ ticketId, userId, reason });
    refund = { amount: r.amount, status: r.status };
  }

  /* 3️⃣ Cancel ticket + order (frees inventory; webhook later marks REFUNDED) */
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`UPDATE tickets SET status = 'CANCELLED' WHERE id = ?`, [ticketId]);
    if (t.order_id) {
      await conn.query(
        `UPDATE orders SET status = 'CANCELLED' WHERE id = ? AND status = 'PAID'`,
        [t.order_id]
      );
      await conn.query(
        `INSERT INTO order_status_history (order_id, to_status, note) VALUES (?, 'CANCELLED', 'user-cancel')`,
        [t.order_id]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  /* 4️⃣ Cancellation email (background-safe, not awaited) */
  sendCancellationConfirmation(t.order_id, t.event_id, userId, ticketId, event, refund);

  return { ticketId, status: "CANCELLED", refund };
};

/**
 * Gathers contact + line breakdown and sends the cancellation email.
 * Fully background-safe — never throws into the cancel flow.
 */
const sendCancellationConfirmation = async (orderId, eventId, userId, ticketId, event, refund) => {
  try {
    const [[contact]] = await pool.query(
      `SELECT name, email, whatsapp_no
       FROM event_user_detail
       WHERE user_id = ? AND event_id = ? AND status = 1
       ORDER BY creation_time DESC, id DESC LIMIT 1`,
      [userId, eventId]
    );
    if (!contact?.email) return;

    let breakdown = [];
    if (orderId) {
      const [rows] = await pool.query(
        `SELECT tt.name, oi.quantity, oi.line_total
         FROM order_items oi JOIN ticket_types tt ON tt.id = oi.ticket_type_id
         WHERE oi.order_id = ?`,
        [orderId]
      );
      breakdown = rows;
    }

    await sendCancellationEmail({
      contact,
      event,
      ticket: { ticketId },
      breakdown,
      refund,
      meta: { orderId, eventId, userId }
    });
  } catch (err) {
    console.error(`❌ Cancellation email failed (ticket ${ticketId}):`, err.message);
  }
};

export const updateTicketStatusService = async (
  qrHash,
  action
) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[ticket]] = await conn.query(
      `
      SELECT id, status, available_ticket, used_ticket
      FROM tickets
      WHERE qr_hash = ?
      FOR UPDATE
      `,
      [qrHash]
    );

    if (!ticket) throw new Error("Invalid ticket");

    /* 🔹 ACTION HANDLER */
    if (action === "USE") {
      if (ticket.status === "CANCELLED") {
        throw new Error("Ticket cancelled");
      }

      if (ticket.used_ticket >= ticket.available_ticket) {
        throw new Error("All entries already used");
      }

      await conn.query(
        `
        UPDATE tickets
        SET
          used_ticket = used_ticket + 1,
          status = IF(
            used_ticket + 1 = available_ticket,
            'USED',
            'BOOKED'
          ),
          used_at = NOW()
        WHERE id = ?
        `,
        [ticket.id]
      );
    }

    else if (action === "CANCEL") {
      await conn.query(
        `
        UPDATE tickets
        SET status = 'CANCELLED'
        WHERE id = ?
        `,
        [ticket.id]
      );
    }

    else {
      throw new Error("Invalid action");
    }

    await conn.commit();

    return {
      ticketId: ticket.id,
      action,
      status:
        action === "USE"
          ? (ticket.used_ticket + 1 === ticket.available_ticket
              ? "USED"
              : "BOOKED")
          : "CANCELLED",
      remaining:
        action === "USE"
          ? ticket.available_ticket - ticket.used_ticket - 1
          : 0
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};


export const scanTicketUsedService = async ({
  ticketId,
  ticketTypeId,
  usedCount,
  scannedBy,
  deviceInfo
}) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    /* 🔒 Lock main ticket */
    const [[ticket]] = await conn.query(
      `
      SELECT id, status, event_id
      FROM tickets
      WHERE id = ?
      FOR UPDATE
      `,
      [ticketId]
    );

    if (!ticket) throw new Error("Invalid ticket");
    if (ticket.status === "CANCELLED")
      throw new Error("Ticket cancelled");

    /* 🔒 Lock specific ticket type row */
    const [[ticketType]] = await conn.query(
      `
      SELECT available, used
      FROM ticket_numbers
      WHERE ticket_id = ?
      AND ticket_type_id = ?
      FOR UPDATE
      `,
      [ticketId, ticketTypeId]
    );

    if (!ticketType)
      throw new Error("Invalid ticket type");

    if (usedCount > ticketType.available)
      throw new Error(
        `Only ${ticketType.available} entries remaining`
      );

    /* 🔄 Update ticket_numbers */
    const newUsed =
      parseInt(ticketType.used, 10) + parseInt(usedCount, 10);

    const newAvailable =
      parseInt(ticketType.available, 10) - parseInt(usedCount, 10);

    await conn.query(
      `
      UPDATE ticket_numbers
      SET
        used = ?,
        available = ?,
        updated_at = NOW()
      WHERE ticket_id = ?
      AND ticket_type_id = ?
      `,
      [newUsed, newAvailable, ticketId, ticketTypeId]
    );

    /* 🧠 Check if ALL ticket types fully used */
    const [[remainingRow]] = await conn.query(
      `
      SELECT SUM(available) AS totalRemaining
      FROM ticket_numbers
      WHERE ticket_id = ?
      `,
      [ticketId]
    );

    const newStatus =
      remainingRow.totalRemaining === 0
        ? "USED"
        : "BOOKED";

    await conn.query(
      `
      UPDATE tickets
      SET status = ?
      WHERE id = ?
      `,
      [newStatus, ticketId]
    );

    /* 📝 Insert scan logs */
    for (let i = 0; i < usedCount; i++) {
      await conn.query(
        `
        INSERT INTO ticket_scans
          (ticket_id, ticket_type_id, scanned_by, scanned_at, device_info, event_id)
        VALUES (?, ?, ?, NOW(), ?, ?)
        `,
        [
          ticketId,
          ticketTypeId,
          scannedBy,
          deviceInfo,
          ticket.event_id
        ]
      );
    }

    await conn.commit();

    return {
      ticketId,
      ticketTypeId,
      status: newStatus,
      used: newUsed,
      remaining: newAvailable
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};


export const insertTicketNumbers = async (
  ticketId,
  ticketTypeId,
  quantity
) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    await conn.query(
      `
      INSERT INTO ticket_numbers (
        ticket_id,
        ticket_type_id,
        available,
        used,
        status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, 0, 1, NOW(), NOW())
      `,
      [ticketId, ticketTypeId, quantity]
    );

    await conn.commit();

    return {
      success: true,
      message: "Ticket numbers inserted"
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};
export const consumeTicket = async (
  ticketId,
  ticketTypeId,
  qty
) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[row]] = await conn.query(
      `
      SELECT available, used
      FROM ticket_numbers
      WHERE ticket_id = ?
      AND ticket_type_id = ?
      FOR UPDATE
      `,
      [ticketId, ticketTypeId]
    );

    if (!row) throw new Error("Ticket type not found");

    if (row.available < qty)
      throw new Error("Not enough tickets available");

    await conn.query(
      `
      UPDATE ticket_numbers
      SET 
        available = available - ?,
        used = used + ?,
        updated_at = NOW()
      WHERE ticket_id = ?
      AND ticket_type_id = ?
      `,
      [qty, qty, ticketId, ticketTypeId]
    );

    await conn.commit();

    return { success: true };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

export const freeTicketService = async (
  ticket_type_id,
  event_id,
  user_id
) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1️⃣ Generate unique QR code
    const todaydate = Date.now();

    const qrCode = `FREE-${event_id}-${user_id}-${todaydate}`;

    const qrHash = crypto
      .createHash("sha256")
      .update(qrCode)
      .digest("hex");

    // 2️⃣ Insert Ticket
    const [ticketResult] = await conn.query(
      `
      INSERT INTO tickets (
        event_id,
        ticket_type_id,
        user_id,
        qr_hash,
        qr_code,
        status,
        available_ticket,
        used_ticket,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, 'BOOKED', 2, 0, NOW())
      `,
      [
        event_id,
        ticket_type_id,
        user_id,
        qrHash,
        qrCode
      ]
    );

    await conn.commit();

    return {
      ticket_id: ticketResult.insertId,
      qr_code: qrCode,
      status: "BOOKED"
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

