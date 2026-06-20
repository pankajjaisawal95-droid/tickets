import pool from "../config/database.js";

/**
 * Contact-form messages. Each submission from the public "Contact Us" page is
 * stored as one row and surfaced in the admin panel.
 *
 * Mirrors the idempotent ensure* helpers and the admin list/export contract
 * used by visit.service.js.
 */

/**
 * Creates the contact_messages table if it doesn't exist. Call once at startup.
 */
export const ensureContactTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contact_messages (
        id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        name       VARCHAR(150)    NOT NULL,
        email      VARCHAR(190)    NOT NULL,
        mobile     VARCHAR(20)     NULL,
        message    TEXT            NOT NULL,
        is_read    TINYINT(1)      NOT NULL DEFAULT 0,
        ip         VARCHAR(45)     NULL,
        user_agent VARCHAR(255)    NULL,
        created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_created (created_at),
        KEY idx_read (is_read)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("✉️  contact message schema ready");
  } catch (err) {
    console.error("❌ ensureContactTable failed:", err.message);
  }
};

/**
 * Inserts one contact message. Returns the new row id. Throws on failure so the
 * controller can report it to the visitor.
 */
export const createContactMessage = async ({ name, email, mobile = null, message, ip = null, userAgent = null }) => {
  const [result] = await pool.query(
    `INSERT INTO contact_messages (name, email, mobile, message, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      String(name).slice(0, 150),
      String(email).slice(0, 190),
      mobile ? String(mobile).slice(0, 20) : null,
      String(message),
      ip ? String(ip).slice(0, 45) : null,
      userAgent ? String(userAgent).slice(0, 255) : null,
    ]
  );
  return result.insertId;
};

/** Builds the shared WHERE clause for the admin list/export. */
const buildContactFilter = ({ search, is_read }) => {
  const where = [];
  const params = [];

  if (is_read === "1" || is_read === "0") {
    where.push("is_read = ?");
    params.push(Number(is_read));
  }
  if (search) {
    where.push("(name LIKE ? OR email LIKE ? OR mobile LIKE ? OR message LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return { whereSql, params };
};

/**
 * Paginated, filterable list of messages (newest first). Shape matches the
 * admin DataTable contract: { rows, total, limit, offset }.
 */
export const listContactMessages = async ({ limit = 20, offset = 0, search, is_read } = {}) => {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

  const { whereSql, params } = buildContactFilter({ search, is_read });

  const [rows] = await pool.query(
    `SELECT id, name, email, mobile, message, is_read, ip, user_agent, created_at
     FROM contact_messages
     ${whereSql}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, safeOffset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM contact_messages ${whereSql}`,
    params
  );

  return { rows, total, limit: safeLimit, offset: safeOffset };
};

/** All matching messages for export (CSV/PDF), newest first. Capped at 50k. */
export const getContactsForExport = async ({ search, is_read } = {}) => {
  const { whereSql, params } = buildContactFilter({ search, is_read });

  const [rows] = await pool.query(
    `SELECT id, name, email, mobile, message, is_read, ip, user_agent, created_at
     FROM contact_messages
     ${whereSql}
     ORDER BY created_at DESC, id DESC
     LIMIT 50000`,
    params
  );

  return rows;
};

/** Marks one message read / unread. Returns true if a row was updated. */
export const setContactReadStatus = async (id, isRead) => {
  const [result] = await pool.query(
    `UPDATE contact_messages SET is_read = ? WHERE id = ?`,
    [isRead ? 1 : 0, id]
  );
  return result.affectedRows > 0;
};
