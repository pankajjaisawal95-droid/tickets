import pool from "../config/database.js";

/**
 * Visitor location tracking. Each call records ONE page open with the
 * approximate location resolved from the visitor's IP (see geo.middleware.js).
 *
 * Background-safe: failures are swallowed/logged so tracking never breaks the
 * actual user request.
 */

/**
 * Creates the visit_logs table if it doesn't exist. Mirrors the idempotent
 * ensure* helpers in schema.service.js; call once at startup.
 */
export const ensureVisitLogTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS visit_logs (
        id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id    BIGINT UNSIGNED NULL,
        ip         VARCHAR(45)     NULL,
        country    CHAR(2)         NULL,
        region     VARCHAR(10)     NULL,
        city       VARCHAR(100)    NULL,
        path       VARCHAR(255)    NULL,
        user_agent VARCHAR(255)    NULL,
        created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_country (country),
        KEY idx_city (city),
        KEY idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("📍 visit log schema ready");
  } catch (err) {
    console.error("❌ ensureVisitLogTable failed:", err.message);
  }
};

/**
 * Inserts one visit row. `geo` is the object attached by geoLocation middleware
 * (req.geo). Returns the new row id, or null on failure (never throws).
 */
export const logVisit = async ({ geo, path = null, userAgent = null, userId = null }) => {
  try {
    const [result] = await pool.query(
      `INSERT INTO visit_logs (user_id, ip, country, region, city, path, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        geo?.ip || null,
        geo?.country || null,
        geo?.region || null,
        geo?.city || null,
        path ? String(path).slice(0, 255) : null,
        userAgent ? String(userAgent).slice(0, 255) : null,
      ]
    );
    return result.insertId;
  } catch (err) {
    console.error("❌ logVisit failed:", err.message);
    return null;
  }
};

/**
 * Builds the shared WHERE clause for the admin list/export.
 * - `country` : exact 2-letter code filter
 * - `search`  : partial match across city / ip / path
 */
const buildVisitFilter = ({ country, search }) => {
  const where = [];
  const params = [];

  if (country) {
    where.push("country = ?");
    params.push(country);
  }
  if (search) {
    where.push("(city LIKE ? OR ip LIKE ? OR path LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return { whereSql, params };
};

/**
 * Paginated, filterable list of visits (newest first). Shape matches the
 * admin DataTable contract: { rows, total, limit, offset }.
 */
export const listVisits = async ({ limit = 20, offset = 0, country, search } = {}) => {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

  const { whereSql, params } = buildVisitFilter({ country, search });

  const [rows] = await pool.query(
    `SELECT id, user_id, ip, country, region, city, path, user_agent, created_at
     FROM visit_logs
     ${whereSql}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, safeOffset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM visit_logs ${whereSql}`,
    params
  );

  return { rows, total, limit: safeLimit, offset: safeOffset };
};

/**
 * All matching visits for export (CSV/PDF), newest first. Capped at 50k rows so
 * a runaway export can't exhaust memory.
 */
export const getVisitsForExport = async ({ country, search } = {}) => {
  const { whereSql, params } = buildVisitFilter({ country, search });

  const [rows] = await pool.query(
    `SELECT id, user_id, ip, country, region, city, path, user_agent, created_at
     FROM visit_logs
     ${whereSql}
     ORDER BY created_at DESC, id DESC
     LIMIT 50000`,
    params
  );

  return rows;
};

/**
 * Aggregated location stats for an admin dashboard.
 * Returns visitor counts grouped by country and by city (top 50 each).
 */
export const getVisitStats = async () => {
  const [byCountry] = await pool.query(
    `SELECT country, COUNT(*) AS visits
     FROM visit_logs
     WHERE country IS NOT NULL
     GROUP BY country
     ORDER BY visits DESC
     LIMIT 50`
  );

  const [byCity] = await pool.query(
    `SELECT country, city, COUNT(*) AS visits
     FROM visit_logs
     WHERE city IS NOT NULL AND city <> ''
     GROUP BY country, city
     ORDER BY visits DESC
     LIMIT 50`
  );

  const [[totals]] = await pool.query(
    `SELECT COUNT(*) AS total_visits, COUNT(DISTINCT ip) AS unique_visitors
     FROM visit_logs`
  );

  return { totals, byCountry, byCity };
};
