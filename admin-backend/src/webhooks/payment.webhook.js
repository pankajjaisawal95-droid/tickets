// src/webhooks/payment.webhook.js
import crypto from "crypto";
import pool from "../config/database.js";
import { createTicketService } from "../services/ticket.service.js";

const verifySignature = (rawBuffer, signature) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("❌ RAZORPAY_WEBHOOK_SECRET not set — rejecting webhook");
    return false;
  }
  const expected = crypto.createHmac("sha256", secret).update(rawBuffer).digest("hex");
  // timing-safe compare
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/**
 * Razorpay webhook — the AUTHORITATIVE fulfilment + reconciliation trigger.
 * Authenticated by signature only. Idempotent via payment_events.uq_event.
 * Handles: payment.captured, payment.failed, refund.processed.
 */
export const paymentWebhook = async (req, res) => {
  const signature = req.headers["x-razorpay-signature"];
  const eventId = req.headers["x-razorpay-event-id"]; // unique per delivery

  // req.body is a Buffer (express.raw mounted in app.js)
  const rawBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");

  if (!verifySignature(rawBuffer, signature)) {
    return res.status(400).json({ success: false, message: "Invalid signature" });
  }

  let event;
  try {
    event = JSON.parse(rawBuffer.toString("utf8"));
  } catch {
    return res.status(400).json({ success: false, message: "Invalid JSON" });
  }

  const eventType = event.event; // e.g. payment.captured
  const paymentEntity = event.payload?.payment?.entity;
  const refundEntity = event.payload?.refund?.entity;
  const gatewayOrderId = paymentEntity?.order_id || null;
  const gatewayPaymentId = paymentEntity?.id || refundEntity?.payment_id || null;
  const dedupeKey = eventId || `${eventType}:${refundEntity?.id || gatewayPaymentId}`;

  const conn = await pool.getConnection();
  let mintOrderId = null;

  try {
    await conn.beginTransaction();

    /* Idempotency: one row per delivered event */
    try {
      await conn.query(
        `INSERT INTO payment_events
           (gateway, event_id, event_type, gateway_order_id, gateway_payment_id, payload)
         VALUES ('razorpay', ?, ?, ?, ?, ?)`,
        [dedupeKey, eventType, gatewayOrderId, gatewayPaymentId, JSON.stringify(event)]
      );
    } catch (e) {
      if (e.code === "ER_DUP_ENTRY") {
        await conn.rollback();
        return res.json({ success: true, message: "Already processed" });
      }
      throw e;
    }

    /* ---------------- payment.captured ---------------- */
    if (eventType === "payment.captured" && gatewayOrderId) {
      const [[payment]] = await conn.query(
        `SELECT * FROM payments WHERE gateway_order_id = ? FOR UPDATE`,
        [gatewayOrderId]
      );

      if (payment && payment.status !== "SUCCESS") {
        await conn.query(
          `UPDATE payments
           SET gateway_payment_id = ?, status = 'SUCCESS', method = ?, captured_at = NOW()
           WHERE id = ?`,
          [gatewayPaymentId, paymentEntity?.method || null, payment.id]
        );
        await conn.query(
          `UPDATE orders SET status = 'PAID', payment_status = 'PAID' WHERE id = ? AND status <> 'PAID'`,
          [payment.order_id]
        );
        await conn.query(
          `INSERT INTO order_status_history (order_id, to_status, note)
           VALUES (?, 'PAID', 'webhook:payment.captured')`,
          [payment.order_id]
        );
        mintOrderId = payment.order_id; // mint after commit (idempotent)
      }
    }

    /* ---------------- payment.failed ---------------- */
    else if (eventType === "payment.failed" && gatewayOrderId) {
      await conn.query(
        `UPDATE payments SET status = 'FAILED', gateway_payment_id = ?
         WHERE gateway_order_id = ? AND status NOT IN ('SUCCESS','REFUNDED')`,
        [gatewayPaymentId, gatewayOrderId]
      );
      await conn.query(
        `UPDATE orders SET payment_status = 'FAILED'
         WHERE payment_order_id = ? AND status = 'HOLD'`,
        [gatewayOrderId]
      );
    }

    /* ---------------- refund.processed ---------------- */
    else if (eventType === "refund.processed" && refundEntity) {
      const refundAmount = Number(refundEntity.amount) / 100;

      const [[payment]] = await conn.query(
        `SELECT * FROM payments WHERE gateway_payment_id = ? FOR UPDATE`,
        [refundEntity.payment_id]
      );

      if (payment) {
        const newRefunded = Number(payment.amount_refunded) + refundAmount;
        const fullyRefunded = newRefunded >= Number(payment.amount) - 0.001;

        await conn.query(
          `UPDATE payments
           SET amount_refunded = ?, status = ?
           WHERE id = ?`,
          [newRefunded, fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED", payment.id]
        );

        await conn.query(
          `UPDATE refunds
           SET status = 'COMPLETED', gateway_refund_id = ?, processed_at = NOW()
           WHERE order_id = ? AND status IN ('INITIATED','PROCESSING')
           ORDER BY id DESC LIMIT 1`,
          [refundEntity.id, payment.order_id]
        );

        // Release inventory + cancel tickets (availability counts only PAID orders)
        await conn.query(
          `UPDATE orders SET status = ?, payment_status = 'REFUNDED' WHERE id = ?`,
          [fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED", payment.order_id]
        );
        await conn.query(
          `UPDATE tickets SET status = 'CANCELLED' WHERE order_id = ? AND status <> 'USED'`,
          [payment.order_id]
        );
        await conn.query(
          `INSERT INTO order_status_history (order_id, to_status, note)
           VALUES (?, ?, 'webhook:refund.processed')`,
          [payment.order_id, fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED"]
        );
      }
    }

    await conn.query(`UPDATE payment_events SET processed = 1 WHERE event_id = ?`, [dedupeKey]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    console.error("Webhook error:", err.message);
    return res.status(500).json({ success: false });
  } finally {
    conn.release();
  }

  // Mint tickets OUTSIDE the webhook txn (idempotent; also sends email + PDF)
  if (mintOrderId) {
    try {
      await createTicketService(mintOrderId);
    } catch (e) {
      console.error(`Webhook ticket minting failed (order ${mintOrderId}):`, e.message);
    }
  }

  return res.json({ success: true });
};
