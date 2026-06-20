import pool from "../config/database.js";
import { parsePaging, buildWhere } from "../helpers/adminQuery.helper.js";

/**
 * Coupon administration. Coupons drive the discount arm of the pricing engine
 * (validated at /order/quote). Soft-deleted via status = 0.
 */

const WRITABLE = [
  "code", "type", "value", "max_discount", "event_id", "ticket_type_id",
  "min_qty", "min_amount", "usage_limit", "per_user_limit",
  "valid_from", "valid_to", "status"
];

const pick = (body) => {
  const out = {};
  for (const k of WRITABLE) {
    if (body[k] !== undefined) out[k] = body[k] === "" ? null : body[k];
  }
  return out;
};

export const listCouponsService = async (q = {}) => {
  const { limit, offset } = parsePaging(q);
  const { whereSql, params } = buildWhere([
    q.search ? { sql: "c.code LIKE ?", value: `%${q.search}%` } : null,
    { sql: "c.status = ?", value: q.status },
    { sql: "c.type = ?", value: q.type },
    { sql: "c.event_id = ?", value: q.event_id }
  ]);

  const [rows] = await pool.query(
    `SELECT c.id, c.code, c.type, c.value, c.max_discount, c.event_id, e.title AS event_title,
            c.ticket_type_id, c.min_qty, c.min_amount, c.usage_limit, c.per_user_limit,
            c.valid_from, c.valid_to, c.status, c.created_at,
            (SELECT COUNT(*) FROM coupon_redemptions r WHERE r.coupon_id = c.id) AS redemption_count
     FROM coupons c
     LEFT JOIN events e ON e.id = c.event_id
     ${whereSql}
     ORDER BY c.created_at DESC, c.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM coupons c ${whereSql}`,
    params
  );

  return { rows, total, limit, offset };
};

export const getCouponService = async (id) => {
  const [[coupon]] = await pool.query(`SELECT * FROM coupons WHERE id = ? LIMIT 1`, [id]);
  if (!coupon) throw new Error("Coupon not found");
  return coupon;
};

export const createCouponService = async (body) => {
  if (!body.code) throw new Error("code is required");
  if (!body.type) throw new Error("type is required (PERCENT|FLAT)");
  if (body.value === undefined) throw new Error("value is required");
  const data = pick(body);
  data.code = String(body.code).trim().toUpperCase();
  const cols = Object.keys(data);
  const placeholders = cols.map(() => "?").join(", ");
  try {
    const [res] = await pool.query(
      `INSERT INTO coupons (${cols.join(", ")}) VALUES (${placeholders})`,
      cols.map((c) => data[c])
    );
    return { id: res.insertId };
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") throw new Error("Coupon code already exists");
    throw err;
  }
};

export const updateCouponService = async (id, body) => {
  const data = pick(body);
  if (data.code) data.code = String(data.code).trim().toUpperCase();
  const cols = Object.keys(data);
  if (!cols.length) throw new Error("No updatable fields provided");
  const setSql = cols.map((c) => `${c} = ?`).join(", ");
  try {
    const [res] = await pool.query(
      `UPDATE coupons SET ${setSql} WHERE id = ?`,
      [...cols.map((c) => data[c]), id]
    );
    if (res.affectedRows === 0) throw new Error("Coupon not found");
    return { id: Number(id), updated: true };
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") throw new Error("Coupon code already exists");
    throw err;
  }
};

export const deleteCouponService = async (id) => {
  await pool.query(`UPDATE coupons SET status = 0 WHERE id = ?`, [id]);
  return { id: Number(id), deleted: true };
};

export const listCouponRedemptionsService = async (couponId, q = {}) => {
  const { limit, offset } = parsePaging(q);
  const [rows] = await pool.query(
    `SELECT r.id, r.coupon_id, r.user_id, u.name AS user_name, u.mobile,
            r.order_id, r.amount, r.created_at
     FROM coupon_redemptions r
     LEFT JOIN users u ON u.id = r.user_id
     WHERE r.coupon_id = ?
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT ? OFFSET ?`,
    [couponId, limit, offset]
  );
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM coupon_redemptions WHERE coupon_id = ?`,
    [couponId]
  );
  return { rows, total, limit, offset };
};
