import pool from "../config/database.js";

/**
 * User reviews shown in the home page "What people are saying" section.
 *
 * Flow: a logged-in user submits a rating + comment → stored as `pending` →
 * an admin approves (or rejects) it → only `approved` rows are shown publicly.
 *
 * Mirrors the idempotent ensure* helpers and the admin list/status contract used
 * by contact.service.js. One review per user (UNIQUE user_id); re-submitting
 * replaces the previous one and sends it back to `pending`.
 */

/** Creates the reviews table if it doesn't exist. Call once at startup. */
export const ensureReviewTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id    BIGINT UNSIGNED NULL,
        name       VARCHAR(150)    NOT NULL,
        role       VARCHAR(120)    NULL,
        rating     TINYINT UNSIGNED NOT NULL,
        comment    TEXT            NOT NULL,
        status     ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
        ip         VARCHAR(45)     NULL,
        user_agent VARCHAR(255)    NULL,
        created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_user (user_id),
        KEY idx_status (status),
        KEY idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("⭐ review schema ready");
  } catch (err) {
    console.error("❌ ensureReviewTable failed:", err.message);
  }
};

/**
 * Looks up the reviewer's display name from the users table. Falls back to
 * "Guest" when the account has no real name — i.e. it's empty or just the
 * mobile number (mobile-only signups store the number in `name`).
 */
export const getReviewerName = async (userId) => {
  const [rows] = await pool.query(
    `SELECT name FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  const name = rows[0]?.name?.trim();
  // Treat a blank name, or one with no letters (e.g. "9876543210"), as missing.
  if (!name || !/[a-zA-Z]/.test(name)) return "Guest";
  return name;
};

/**
 * Inserts (or replaces) one user's review. Always lands as `pending` so it must
 * be approved before it shows publicly. Returns the row id.
 */
export const createReview = async ({ userId, name, role = null, rating, comment, ip = null, userAgent = null }) => {
  const [result] = await pool.query(
    `INSERT INTO reviews (user_id, name, role, rating, comment, ip, user_agent, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       role = VALUES(role),
       rating = VALUES(rating),
       comment = VALUES(comment),
       ip = VALUES(ip),
       user_agent = VALUES(user_agent),
       status = 'pending',
       updated_at = CURRENT_TIMESTAMP`,
    [
      userId || null,
      String(name).slice(0, 150),
      role ? String(role).slice(0, 120) : null,
      Number(rating),
      String(comment),
      ip ? String(ip).slice(0, 45) : null,
      userAgent ? String(userAgent).slice(0, 255) : null,
    ]
  );
  return result.insertId;
};

/** Public: approved reviews for the home page, newest first. */
export const getApprovedReviews = async ({ limit = 12 } = {}) => {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 60);
  const [rows] = await pool.query(
    `SELECT id, name, role, rating, comment, created_at
     FROM reviews
     WHERE status = 'approved'
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
    [safeLimit]
  );
  return rows;
};

/** Builds the shared WHERE clause for the admin list. */
const buildReviewFilter = ({ search, status }) => {
  const where = [];
  const params = [];

  if (status === "pending" || status === "approved" || status === "rejected") {
    where.push("status = ?");
    params.push(status);
  }
  if (search) {
    where.push("(name LIKE ? OR role LIKE ? OR comment LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return { whereSql, params };
};

/**
 * Admin: paginated, filterable list of reviews (newest first). Shape matches the
 * admin DataTable contract: { rows, total, limit, offset }.
 */
export const listReviews = async ({ limit = 20, offset = 0, search, status } = {}) => {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

  const { whereSql, params } = buildReviewFilter({ search, status });

  const [rows] = await pool.query(
    `SELECT id, user_id, name, role, rating, comment, status, created_at, updated_at
     FROM reviews
     ${whereSql}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, safeOffset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM reviews ${whereSql}`,
    params
  );

  return { rows, total, limit: safeLimit, offset: safeOffset };
};

/** Admin: sets a review's moderation status. Returns true if a row changed. */
export const setReviewStatus = async (id, status) => {
  if (!["pending", "approved", "rejected"].includes(status)) return false;
  const [result] = await pool.query(
    `UPDATE reviews SET status = ? WHERE id = ?`,
    [status, id]
  );
  return result.affectedRows > 0;
};
