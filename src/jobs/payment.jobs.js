import pool from "../config/database.js";
import { fetchGatewayOrderPayments } from "../gateways/razorpay.gateway.js";
import { createTicketService } from "../services/ticket.service.js";

/**
 * Recurring payment maintenance jobs (plain setInterval — no cron dep).
 *  - expireHolds:     release stale HOLD orders so inventory frees up.
 *  - reconcileOrders: self-heal orders captured at the gateway but stuck on
 *                     HOLD locally (e.g. the browser died before /verify-payment).
 *
 * Both are guarded against overlapping runs and never throw.
 */

const EXPIRE_INTERVAL = 5 * 60 * 1000;     // 5 min
const RECONCILE_INTERVAL = 10 * 60 * 1000; // 10 min

let expiring = false;
let reconciling = false;

export const expireHolds = async () => {
  if (expiring) return;
  expiring = true;
  try {
    const [res] = await pool.query(
      `UPDATE orders
       SET status = 'EXPIRED', payment_status = 'FAILED'
       WHERE status = 'HOLD' AND hold_expires_at < NOW()`
    );
    if (res.affectedRows) console.log(`⌛ expired ${res.affectedRows} stale hold(s)`);
  } catch (err) {
    console.error("expireHolds failed:", err.message);
  } finally {
    expiring = false;
  }
};

export const reconcileOrders = async () => {
  if (reconciling) return;
  reconciling = true;
  try {
    // HOLD orders from the last 24h whose payment is still un-promoted
    const [rows] = await pool.query(
      `SELECT o.id AS order_id, o.total_price, p.id AS payment_id, p.gateway_order_id
       FROM orders o
       JOIN payments p ON p.order_id = o.id
       WHERE o.status = 'HOLD'
         AND p.status = 'CREATED'
         AND o.created_at > (NOW() - INTERVAL 1 DAY)
       LIMIT 50`
    );

    for (const row of rows) {
      try {
        const payments = await fetchGatewayOrderPayments(row.gateway_order_id);
        const captured = payments.find((p) => p.status === "captured");
        if (!captured) continue;

        const expectedPaise = Math.round(Number(row.total_price) * 100);
        if (Number(captured.amount) !== expectedPaise) {
          console.warn(`reconcile: amount mismatch on order ${row.order_id}`);
          continue;
        }

        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();
          await conn.query(
            `UPDATE payments SET gateway_payment_id = ?, status = 'SUCCESS', method = ?, captured_at = NOW()
             WHERE id = ? AND status <> 'SUCCESS'`,
            [captured.id, captured.method || null, row.payment_id]
          );
          await conn.query(
            `UPDATE orders SET status = 'PAID', payment_status = 'PAID' WHERE id = ? AND status <> 'PAID'`,
            [row.order_id]
          );
          await conn.query(
            `INSERT INTO order_status_history (order_id, to_status, note) VALUES (?, 'PAID', 'reconcile')`,
            [row.order_id]
          );
          await conn.commit();
        } catch (e) {
          await conn.rollback();
          throw e;
        } finally {
          conn.release();
        }

        await createTicketService(row.order_id); // idempotent + emails
        console.log(`🔧 reconciled order ${row.order_id}`);
      } catch (e) {
        console.error(`reconcile order ${row.order_id} failed:`, e.message);
      }
    }
  } catch (err) {
    console.error("reconcileOrders failed:", err.message);
  } finally {
    reconciling = false;
  }
};

export const startBackgroundJobs = () => {
  setInterval(expireHolds, EXPIRE_INTERVAL).unref?.();
  setInterval(reconcileOrders, RECONCILE_INTERVAL).unref?.();
  console.log("⚙️  payment background jobs started");
};
