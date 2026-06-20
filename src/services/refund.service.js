import pool from "../config/database.js";
import { createGatewayRefund } from "../gateways/razorpay.gateway.js";

/**
 * Requests a refund for a PAID order (resolved from orderId or ticketId).
 *
 * Flow: validate → insert refunds(REQUESTED) → call gateway → mark PROCESSING.
 * The refund.processed webhook finalizes it (PROCESSED + inventory release +
 * ticket cancellation). Idempotent-ish: a second request while one is open is
 * rejected.
 *
 * Refund window: allowed until the event starts (override via
 * REFUND_CUTOFF_HOURS — hours before start_datetime).
 */
export const requestRefundService = async ({ orderId, ticketId, userId, reason, isAdmin = false }) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Resolve order from ticket if needed
    if (!orderId && ticketId) {
      const [[t]] = await conn.query(
        `SELECT order_id FROM tickets WHERE id = ?`,
        [ticketId]
      );
      if (!t?.order_id) throw new Error("Ticket not found");
      orderId = t.order_id;
    }
    if (!orderId) throw new Error("orderId or ticketId required");

    // Lock order
    const [[order]] = await conn.query(
      `SELECT o.id, o.user_id, o.status, o.total_price, e.start_datetime
       FROM orders o JOIN events e ON e.id = o.event_id
       WHERE o.id = ? FOR UPDATE`,
      [orderId]
    );
    if (!order) throw new Error("Order not found");
    if (!isAdmin && Number(order.user_id) !== Number(userId)) {
      throw new Error("Not your order");
    }
    if (order.status !== "PAID") {
      throw new Error("Only paid orders can be refunded");
    }

    // Refund window
    const cutoffHours = Number(process.env.REFUND_CUTOFF_HOURS || 0);
    if (order.start_datetime) {
      const cutoff = new Date(order.start_datetime).getTime() - cutoffHours * 3600 * 1000;
      if (Date.now() > cutoff) throw new Error("Refund window has closed");
    }

    // Successful payment for this order
    const [[payment]] = await conn.query(
      `SELECT id, gateway_payment_id, amount, amount_refunded
       FROM payments
       WHERE order_id = ? AND status IN ('SUCCESS','PARTIALLY_REFUNDED')
       ORDER BY id DESC LIMIT 1`,
      [orderId]
    );
    if (!payment?.gateway_payment_id) throw new Error("No captured payment to refund");

    const refundable = Number(payment.amount) - Number(payment.amount_refunded);
    if (refundable <= 0) throw new Error("Order already fully refunded");

    // Reject if a refund is already open
    const [[open]] = await conn.query(
      `SELECT id FROM refunds WHERE order_id = ? AND status IN ('INITIATED','PROCESSING') LIMIT 1`,
      [orderId]
    );
    if (open) throw new Error("A refund is already in progress");

    const refundType =
      refundable >= Number(payment.amount) - 0.001 ? "FULL" : "PARTIAL";

    const [ins] = await conn.query(
      `INSERT INTO refunds
         (order_id, payment_id, ticket_id, refund_amount, refund_type, refund_reason, status, initiated_by)
       VALUES (?, ?, ?, ?, ?, ?, 'INITIATED', ?)`,
      [orderId, payment.id, ticketId || null, refundable, refundType, reason || null, userId || null]
    );
    const refundId = ins.insertId;

    await conn.commit();
    conn.release();

    // Call gateway OUTSIDE the txn
    try {
      const gwRefund = await createGatewayRefund(payment.gateway_payment_id, refundable, {
        order_id: String(orderId),
        refund_id: String(refundId)
      });
      await pool.query(
        `UPDATE refunds SET status = 'PROCESSING', gateway_refund_id = ? WHERE id = ?`,
        [gwRefund.id, refundId]
      );
      return { refundId, status: "PROCESSING", amount: refundable, gatewayRefundId: gwRefund.id };
    } catch (gwErr) {
      await pool.query(`UPDATE refunds SET status = 'FAILED' WHERE id = ?`, [refundId]);
      throw new Error(gwErr?.error?.description || gwErr.message || "Gateway refund failed");
    }
  } catch (err) {
    try { await conn.rollback(); } catch { /* already committed/released */ }
    try { conn.release(); } catch { /* already released */ }
    throw err;
  }
};
