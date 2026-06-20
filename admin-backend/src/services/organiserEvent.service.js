import pool from "../config/database.js";
import { parsePaging, buildWhere } from "../helpers/adminQuery.helper.js";

/**
 * Organiser-owned events. The organiser owns the *content* of their events
 * (title, schedule, media, pricing rules) but NOT the lifecycle controls:
 * `approval_status` and `is_active` are server-owned — set to PENDING / 0 on
 * create and only an admin may flip them (publish to the public storefront).
 * `organizer_id` is forced to the logged-in organiser, never client-supplied.
 */
const ORGANISER_EVENT_WRITABLE = [
  "title", "description", "venue", "start_datetime", "end_datetime",
  "banner_url", "banner_url_mobile", "cart_url", "category_id",
  "visibility", "city", "state", "country",
  "contact_person", "contact_number", "contact_email", "internal_notes",
  "gst_percent", "convenience_fee_percent", "convenience_fee_flat", "gst_inclusive"
];

const pick = (body, allowed) => {
  const out = {};
  for (const k of allowed) {
    if (body[k] !== undefined) out[k] = body[k] === "" ? null : body[k];
  }
  return out;
};

export const listOrganiserEventsService = async (organizerId, q = {}) => {
  const { limit, offset } = parsePaging(q);
  const { whereSql, params } = buildWhere([
    { sql: "e.organizer_id = ?", value: organizerId },
    q.search ? { sql: "(e.title LIKE ? OR e.venue LIKE ?)", params: [`%${q.search}%`, `%${q.search}%`] } : null,
    { sql: "e.approval_status = ?", value: q.approval_status },
    { sql: "e.is_active = ?", value: q.status },
    { sql: "e.category_id = ?", value: q.category_id }
  ]);

  const [rows] = await pool.query(
    `SELECT e.id, e.title, e.venue, e.start_datetime, e.end_datetime,
            e.banner_url, e.category_id, c.name AS category_name,
            e.approval_status, e.is_active, e.created_at,
            (SELECT COUNT(*) FROM ticket_types tt WHERE tt.event_id = e.id AND tt.status = 1) AS ticket_type_count
     FROM events e
     LEFT JOIN event_categories c ON c.id = e.category_id
     ${whereSql}
     ORDER BY e.start_datetime DESC, e.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM events e ${whereSql}`,
    params
  );

  return { rows, total, limit, offset };
};

export const createOrganiserEventService = async (organizerId, body) => {
  if (!body.title) throw new Error("title is required");
  const data = pick(body, ORGANISER_EVENT_WRITABLE);
  data.title = body.title;
  // Server-owned: new organiser events always start unpublished and pending.
  data.organizer_id = organizerId;
  data.approval_status = "PENDING";
  data.is_active = 0;

  const cols = Object.keys(data);
  const placeholders = cols.map(() => "?").join(", ");
  const [res] = await pool.query(
    `INSERT INTO events (${cols.join(", ")}) VALUES (${placeholders})`,
    cols.map((c) => data[c])
  );
  return { id: res.insertId };
};

export const updateOrganiserEventService = async (eventId, body) => {
  const data = pick(body, ORGANISER_EVENT_WRITABLE);
  const cols = Object.keys(data);
  if (!cols.length) throw new Error("No updatable fields provided");
  const setSql = cols.map((c) => `${c} = ?`).join(", ");
  const [res] = await pool.query(
    `UPDATE events SET ${setSql} WHERE id = ?`,
    [...cols.map((c) => data[c]), eventId]
  );
  if (res.affectedRows === 0) throw new Error("Event not found");
  return { id: Number(eventId), updated: true };
};

/**
 * Submit an event for admin review. Re-asserts PENDING (no-op if already there)
 * and returns the event to the admin approval queue. Gated by the controller on
 * the organiser's KYC status.
 */
export const submitOrganiserEventService = async (eventId) => {
  const [res] = await pool.query(
    `UPDATE events SET approval_status = 'PENDING' WHERE id = ?`,
    [eventId]
  );
  if (res.affectedRows === 0) throw new Error("Event not found");
  return { id: Number(eventId), approval_status: "PENDING" };
};
