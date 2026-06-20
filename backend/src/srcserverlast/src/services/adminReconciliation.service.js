import pool from "../config/database.js";
import { parsePaging, buildWhere } from "../helpers/adminQuery.helper.js";

/**
 * Read-only payment reconciliation: the gateway-truth payments ledger and the
 * raw webhook event log.
 */

export const listPaymentsService = async (q = {}) => {
  const { limit, offset } = parsePaging(q);
  const { whereSql, params } = buildWhere([
    q.search ? { sql: "(p.order_id = ? OR p.gateway_payment_id LIKE ? OR p.gateway_order_id LIKE ?)", params: [Number(q.search) || 0, `%${q.search}%`, `%${q.search}%`] } : null,
    { sql: "p.status = ?", value: q.status },
    { sql: "p.gateway = ?", value: q.gateway },
    { sql: "p.created_at >= ?", value: q.from },
    { sql: "p.created_at <= ?", value: q.to }
  ]);

  const [rows] = await pool.query(
    `SELECT p.id, p.order_id, p.gateway, p.gateway_order_id, p.gateway_payment_id,
            p.amount, p.currency, p.method, p.amount_refunded, p.status,
            p.captured_at, p.created_at, o.status AS order_status
     FROM payments p
     LEFT JOIN orders o ON o.id = p.order_id
     ${whereSql}
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM payments p ${whereSql}`,
    params
  );

  return { rows, total, limit, offset };
};

export const listPaymentEventsService = async (q = {}) => {
  const { limit, offset } = parsePaging(q);
  const { whereSql, params } = buildWhere([
    q.search ? { sql: "(pe.gateway_order_id LIKE ? OR pe.gateway_payment_id LIKE ? OR pe.event_id LIKE ?)", params: [`%${q.search}%`, `%${q.search}%`, `%${q.search}%`] } : null,
    { sql: "pe.event_type = ?", value: q.event_type },
    { sql: "pe.processed = ?", value: q.processed },
    { sql: "pe.received_at >= ?", value: q.from },
    { sql: "pe.received_at <= ?", value: q.to }
  ]);

  const [rows] = await pool.query(
    `SELECT pe.id, pe.gateway, pe.event_id, pe.event_type, pe.gateway_order_id,
            pe.gateway_payment_id, pe.processed, pe.received_at
     FROM payment_events pe
     ${whereSql}
     ORDER BY pe.received_at DESC, pe.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM payment_events pe ${whereSql}`,
    params
  );

  return { rows, total, limit, offset };
};
