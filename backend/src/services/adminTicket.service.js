import pool from "../config/database.js";
import { parsePaging, buildWhere } from "../helpers/adminQuery.helper.js";

/**
 * Admin tickets + gate-scan views/analytics.
 */

export const listTicketsService = async (q = {}) => {
  const { limit, offset } = parsePaging(q);
  const { whereSql, params } = buildWhere([
    q.search ? { sql: "(t.id = ? OR t.qr_hash LIKE ? OR u.mobile LIKE ? OR u.name LIKE ? OR EXISTS(SELECT 1 FROM event_user_detail eud WHERE eud.user_id = t.user_id AND eud.event_id = t.event_id AND eud.status = 1 AND eud.email LIKE ?))", params: [Number(q.search) || 0, `%${q.search}%`, `%${q.search}%`, `%${q.search}%`, `%${q.search}%`] } : null,
    { sql: "t.event_id = ?", value: q.event_id },
    { sql: "t.status = ?", value: q.status },
    { sql: "t.ticket_type_id = ?", value: q.ticket_type_id },
    { sql: "t.created_at >= ?", value: q.from },
    { sql: "t.created_at <= ?", value: q.to }
  ]);

  const [rows] = await pool.query(
    `SELECT t.id, t.order_id, t.event_id, e.title AS event_title, e.start_datetime AS event_start, e.presented_by, t.ticket_type_id,
            tt.name AS ticket_type_name, t.user_id, u.name AS user_name, u.mobile,
            (SELECT eud.email FROM event_user_detail eud
              WHERE eud.user_id = t.user_id AND eud.event_id = t.event_id AND eud.status = 1
              ORDER BY eud.id DESC LIMIT 1) AS email,
            t.status, t.available_ticket, t.used_ticket, t.used_at, t.created_at
     FROM tickets t
     LEFT JOIN events e ON e.id = t.event_id
     LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id
     LEFT JOIN users u ON u.id = t.user_id
     ${whereSql}
     ORDER BY t.created_at DESC, t.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM tickets t
     LEFT JOIN users u ON u.id = t.user_id
     ${whereSql}`,
    params
  );

  return { rows, total, limit, offset };
};

/**
 * All matching tickets for export (CSV/PDF), newest first. Same filters as the
 * list (search, event_id, status, ticket_type_id, from, to) but no pagination —
 * capped at 50k rows so a runaway export can't exhaust memory.
 */
export const listTicketsForExport = async (q = {}) => {
  const { whereSql, params } = buildWhere([
    q.search ? { sql: "(t.id = ? OR t.qr_hash LIKE ? OR u.mobile LIKE ? OR u.name LIKE ? OR EXISTS(SELECT 1 FROM event_user_detail eud WHERE eud.user_id = t.user_id AND eud.event_id = t.event_id AND eud.status = 1 AND eud.email LIKE ?))", params: [Number(q.search) || 0, `%${q.search}%`, `%${q.search}%`, `%${q.search}%`, `%${q.search}%`] } : null,
    { sql: "t.event_id = ?", value: q.event_id },
    { sql: "t.status = ?", value: q.status },
    { sql: "t.ticket_type_id = ?", value: q.ticket_type_id },
    { sql: "t.created_at >= ?", value: q.from },
    { sql: "t.created_at <= ?", value: q.to }
  ]);

  const [rows] = await pool.query(
    `SELECT t.id, t.order_id, t.event_id, e.title AS event_title, e.start_datetime AS event_start, e.presented_by, t.ticket_type_id,
            tt.name AS ticket_type_name, t.user_id, u.name AS user_name, u.mobile,
            (SELECT eud.email FROM event_user_detail eud
              WHERE eud.user_id = t.user_id AND eud.event_id = t.event_id AND eud.status = 1
              ORDER BY eud.id DESC LIMIT 1) AS email,
            t.status, t.available_ticket, t.used_ticket, t.used_at, t.created_at
     FROM tickets t
     LEFT JOIN events e ON e.id = t.event_id
     LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id
     LEFT JOIN users u ON u.id = t.user_id
     ${whereSql}
     ORDER BY t.created_at DESC, t.id DESC
     LIMIT 50000`,
    params
  );

  return rows;
};

export const listEventScansService = async (eventId, q = {}) => {
  const { limit, offset } = parsePaging(q);
  const [rows] = await pool.query(
    `SELECT s.id, s.ticket_id, s.ticket_type_id, tt.name AS ticket_type_name,
            s.scanned_by, v.name AS scanned_by_name, s.scanned_at, s.device_info,
            tn.available AS available, tn.used AS used
     FROM ticket_scans s
     LEFT JOIN ticket_types tt ON tt.id = s.ticket_type_id
     LEFT JOIN ticket_validator v ON v.id = s.scanned_by
     LEFT JOIN ticket_numbers tn ON tn.ticket_id = s.ticket_id AND tn.ticket_type_id = s.ticket_type_id
     WHERE s.event_id = ?
     ORDER BY s.scanned_at DESC, s.id DESC
     LIMIT ? OFFSET ?`,
    [eventId, limit, offset]
  );
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM ticket_scans WHERE event_id = ?`,
    [eventId]
  );
  return { rows, total, limit, offset };
};

/** Used-vs-available per ticket type for one event (scan analytics). */
export const getScanAnalyticsService = async (eventId) => {
  // Usage is tracked per ticket+type in `ticket_numbers` (the live scan flow
  // updates available/used there, NOT on tickets.*). Aggregate that table,
  // joined through the event's non-cancelled tickets.
  const [byType] = await pool.query(
    `SELECT tt.id AS ticket_type_id, tt.name AS ticket_type_name,
            tt.total_quantity,
            COALESCE(SUM(tn.available + tn.used), 0) AS booked,
            COALESCE(SUM(tn.available), 0) AS available,
            COALESCE(SUM(tn.used), 0)      AS used
     FROM ticket_types tt
     LEFT JOIN tickets t ON t.event_id = ? AND t.status <> 'CANCELLED'
     LEFT JOIN ticket_numbers tn ON tn.ticket_id = t.id AND tn.ticket_type_id = tt.id AND tn.status = 1
     WHERE tt.event_id = ?
     GROUP BY tt.id, tt.name, tt.total_quantity
     ORDER BY tt.id ASC`,
    [eventId, eventId]
  );

  const [[totals]] = await pool.query(
    `SELECT COUNT(*) AS total_scans
     FROM ticket_scans WHERE event_id = ?`,
    [eventId]
  );

  return { byType, totalScans: Number(totals.total_scans) };
};
