import pool from "../config/database.js";
import { parsePaging, buildWhere } from "../helpers/adminQuery.helper.js";

/**
 * Admin user directory + gate-validator management.
 */

export const listUsersService = async (q = {}) => {
  const { limit, offset } = parsePaging(q);
  const { whereSql, params } = buildWhere([
    q.search ? { sql: "(u.name LIKE ? OR u.mobile LIKE ? OR u.email LIKE ?)", params: [`%${q.search}%`, `%${q.search}%`, `%${q.search}%`] } : null,
    { sql: "u.status = ?", value: q.status },
    { sql: "u.role_id = ?", value: q.role_id }
  ]);

  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.mobile, u.email, u.role_id, u.status, u.is_verified, u.created_at,
            (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id AND o.status = 'PAID') AS paid_orders
     FROM users u
     ${whereSql}
     ORDER BY u.created_at DESC, u.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM users u ${whereSql}`,
    params
  );

  return { rows, total, limit, offset };
};

export const listValidatorsService = async (q = {}) => {
  const { limit, offset } = parsePaging(q);
  const { whereSql, params } = buildWhere([
    q.search ? { sql: "(v.name LIKE ? OR v.mobile LIKE ?)", params: [`%${q.search}%`, `%${q.search}%`] } : null,
    { sql: "v.status = ?", value: q.status },
    { sql: "v.event_id = ?", value: q.event_id }
  ]);

  const [rows] = await pool.query(
    `SELECT v.id, v.name, v.email, v.mobile, v.event_id, e.title AS event_title,
            v.is_verified, v.status, v.device_id, v.device_name, v.created_at
     FROM ticket_validator v
     LEFT JOIN events e ON e.id = v.event_id
     ${whereSql}
     ORDER BY v.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM ticket_validator v ${whereSql}`,
    params
  );

  return { rows, total, limit, offset };
};

export const createValidatorService = async (body) => {
  const { name, mobile, email, event_id } = body;
  if (!name) throw new Error("name is required");
  if (!mobile) throw new Error("mobile is required");
  if (!event_id) throw new Error("event_id is required");
  const [res] = await pool.query(
    `INSERT INTO ticket_validator (name, mobile, email, event_id, is_verified, status)
     VALUES (?, ?, ?, ?, 0, 'ACTIVE')`,
    [name, mobile, email || null, event_id]
  );
  return { id: res.insertId };
};

export const setValidatorStatusService = async (id, status) => {
  const normalized = String(status || "").toUpperCase();
  if (!["ACTIVE", "DEACTIVE"].includes(normalized)) {
    throw new Error("status must be ACTIVE or DEACTIVE");
  }
  const [res] = await pool.query(
    `UPDATE ticket_validator SET status = ?, updated_at = NOW() WHERE id = ?`,
    [normalized, id]
  );
  if (res.affectedRows === 0) throw new Error("Validator not found");
  return { id: Number(id), status: normalized };
};
