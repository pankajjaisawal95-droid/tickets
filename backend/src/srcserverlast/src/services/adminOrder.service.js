import pool from "../config/database.js";
import { parsePaging, buildWhere } from "../helpers/adminQuery.helper.js";

/**
 * Admin orders + refunds (read views). Refund *creation* reuses
 * services/refund.service.js#requestRefundService (admin-initiated).
 */

/* --------------------------------- orders --------------------------------- */

export const listOrdersService = async (q = {}) => {
  const { limit, offset } = parsePaging(q);
  const { whereSql, params } = buildWhere([
    q.search ? { sql: "(o.id = ? OR u.mobile LIKE ? OR u.name LIKE ?)", params: [Number(q.search) || 0, `%${q.search}%`, `%${q.search}%`] } : null,
    { sql: "o.status = ?", value: q.status },
    { sql: "o.event_id = ?", value: q.event_id },
    { sql: "o.created_at >= ?", value: q.from },
    { sql: "o.created_at <= ?", value: q.to }
  ]);

  const [rows] = await pool.query(
    `SELECT o.id, o.user_id, u.name AS user_name, u.mobile, o.event_id, e.title AS event_title,
            o.quantity, o.subtotal, o.discount_amount, o.convenience_fee, o.tax_amount,
            o.total_price, o.currency, o.status, o.payment_status, o.payment_order_id, o.created_at
     FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
     LEFT JOIN events e ON e.id = o.event_id
     ${whereSql}
     ORDER BY o.created_at DESC, o.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
     ${whereSql}`,
    params
  );

  return { rows, total, limit, offset };
};

export const getOrderService = async (id) => {
  const [[order]] = await pool.query(
    `SELECT o.*, u.name AS user_name, u.mobile, u.email AS user_email, e.title AS event_title,
            e.start_datetime
     FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
     LEFT JOIN events e ON e.id = o.event_id
     WHERE o.id = ? LIMIT 1`,
    [id]
  );
  if (!order) throw new Error("Order not found");

  const [items] = await pool.query(
    `SELECT oi.id, oi.ticket_type_id, tt.name AS ticket_type_name, oi.quantity,
            oi.unit_price, oi.price, oi.gst_percent, oi.discount_amount, oi.gst_amount, oi.line_total
     FROM order_items oi
     LEFT JOIN ticket_types tt ON tt.id = oi.ticket_type_id
     WHERE oi.order_id = ?`,
    [id]
  );

  const [payments] = await pool.query(
    `SELECT id, gateway, gateway_order_id, gateway_payment_id, amount, currency,
            method, amount_refunded, status, captured_at, created_at
     FROM payments WHERE order_id = ? ORDER BY id DESC`,
    [id]
  );

  const [refunds] = await pool.query(
    `SELECT id, payment_id, ticket_id, refund_amount, refund_type, refund_reason,
            gateway_refund_id, status, initiated_by, processed_at, created_at
     FROM refunds WHERE order_id = ? ORDER BY id DESC`,
    [id]
  );

  const [tickets] = await pool.query(
    `SELECT id, ticket_type_id, status, qr_hash, available_ticket, used_ticket, used_at, created_at
     FROM tickets WHERE order_id = ? ORDER BY id ASC`,
    [id]
  );

  const [[contact]] = await pool.query(
    `SELECT name, whatsapp_no, email
     FROM event_user_detail
     WHERE user_id = ? AND event_id = ?
     ORDER BY id DESC LIMIT 1`,
    [order.user_id, order.event_id]
  );

  const [statusHistory] = await pool.query(
    `SELECT id, from_status, to_status, note, created_at
     FROM order_status_history WHERE order_id = ? ORDER BY id ASC`,
    [id]
  );

  return { order, items, payments, refunds, tickets, contact: contact || null, statusHistory };
};

/* --------------------------------- refunds -------------------------------- */

export const listRefundsService = async (q = {}) => {
  const { limit, offset } = parsePaging(q);
  const { whereSql, params } = buildWhere([
    q.search ? { sql: "(r.order_id = ? OR r.gateway_refund_id LIKE ?)", params: [Number(q.search) || 0, `%${q.search}%`] } : null,
    { sql: "r.status = ?", value: q.status },
    { sql: "r.created_at >= ?", value: q.from },
    { sql: "r.created_at <= ?", value: q.to }
  ]);

  const [rows] = await pool.query(
    `SELECT r.id, r.order_id, r.payment_id, r.ticket_id, r.refund_amount, r.refund_type,
            r.refund_reason, r.gateway_refund_id, r.status, r.initiated_by, r.processed_at, r.created_at,
            o.event_id, e.title AS event_title, u.name AS user_name, u.mobile
     FROM refunds r
     LEFT JOIN orders o ON o.id = r.order_id
     LEFT JOIN events e ON e.id = o.event_id
     LEFT JOIN users u ON u.id = o.user_id
     ${whereSql}
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM refunds r ${whereSql}`,
    params
  );

  return { rows, total, limit, offset };
};

export const getRefundService = async (id) => {
  const [[refund]] = await pool.query(
    `SELECT r.*, o.event_id, e.title AS event_title, u.name AS user_name, u.mobile
     FROM refunds r
     LEFT JOIN orders o ON o.id = r.order_id
     LEFT JOIN events e ON e.id = o.event_id
     LEFT JOIN users u ON u.id = o.user_id
     WHERE r.id = ? LIMIT 1`,
    [id]
  );
  if (!refund) throw new Error("Refund not found");
  return refund;
};
