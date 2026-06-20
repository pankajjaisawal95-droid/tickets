import pool from "../config/database.js";
import { getUserDetail } from "../services/auth.service.js";
import { error } from "../helpers/response.helper.js";

/**
 * Organiser guards. Run AFTER `authenticate` (which sets req.userId = <mobile>).
 *
 * `requireOrganiser` resolves the user, rejects unless role_id === ORGANISER_ROLE_ID
 * (default 3 — env-overridable, mirrors ADMIN_ROLE_ID), loads the linked
 * `organizers` row and attaches `req.organiser = { user, organizer }`.
 *
 * `ensureOrganiserOwnsEvent(resolveEventId)` guards every event-scoped route so an
 * organiser can only touch their OWN events. This lets us safely reuse the admin
 * event/ticket/seat/media controllers under /organiser without duplicating logic.
 */
const ORGANISER_ROLE_ID = Number(process.env.ORGANISER_ROLE_ID || 3);

export const requireOrganiser = async (req, res, next) => {
  try {
    if (!req.userId) return error(res, "Not authorized", 401);

    const result = await getUserDetail(req.userId);
    if (!result?.status || !result.user) return error(res, "Not authorized", 403);
    if (Number(result.user.role_id) !== ORGANISER_ROLE_ID) {
      return error(res, "Not authorized: organiser access required", 403);
    }

    const [[organizer]] = await pool.query(
      `SELECT id, user_id, organization_name, contact_email, kyc_status, status
       FROM organizers WHERE user_id = ? LIMIT 1`,
      [result.user.id]
    );
    if (!organizer) return error(res, "Organiser profile not found", 403);

    req.organiser = { user: result.user, organizer };
    next();
  } catch (err) {
    console.error("requireOrganiser error:", err.message);
    return error(res, "Not authorized", 403);
  }
};

/* ---- event-id resolvers (path param → owning event id) ---- */

const eventIdFromParam = (param) => async (req) => req.params[param];

const eventIdFromTicketType = async (req) => {
  const [[row]] = await pool.query(
    `SELECT event_id FROM ticket_types WHERE id = ? LIMIT 1`,
    [req.params.id]
  );
  return row?.event_id;
};

const eventIdFromSeat = async (req) => {
  const [[row]] = await pool.query(
    `SELECT event_id FROM seats WHERE id = ? LIMIT 1`,
    [req.params.seatId]
  );
  return row?.event_id;
};

const eventIdFromGallery = async (req) => {
  const [[row]] = await pool.query(
    `SELECT event_id FROM event_gallery WHERE id = ? LIMIT 1`,
    [req.params.id]
  );
  return row?.event_id;
};

const eventIdFromArtist = async (req) => {
  const [[row]] = await pool.query(
    `SELECT event_id FROM event_artists WHERE id = ? LIMIT 1`,
    [req.params.id]
  );
  return row?.event_id;
};

/**
 * Verifies the resolved event belongs to the logged-in organiser. `source`
 * selects how the event id is derived from the request:
 *   'event'      → :id / :eventId is the event id
 *   'ticketType' → :id is a ticket_type id (look up its event)
 *   'seat'       → :seatId is a seat id (look up its event)
 */
export const ensureOrganiserOwnsEvent = (source = "event", param = "id") => {
  const resolver =
    source === "ticketType" ? eventIdFromTicketType :
    source === "seat" ? eventIdFromSeat :
    source === "gallery" ? eventIdFromGallery :
    source === "artist" ? eventIdFromArtist :
    eventIdFromParam(param);

  return async (req, res, next) => {
    try {
      const eventId = await resolver(req);
      if (!eventId) return error(res, "Event not found", 404);

      const [[event]] = await pool.query(
        `SELECT organizer_id FROM events WHERE id = ? LIMIT 1`,
        [eventId]
      );
      if (!event) return error(res, "Event not found", 404);
      if (Number(event.organizer_id) !== Number(req.organiser.organizer.id)) {
        return error(res, "Not authorized: this event belongs to another organiser", 403);
      }

      req.ownedEventId = Number(eventId);
      next();
    } catch (err) {
      console.error("ensureOrganiserOwnsEvent error:", err.message);
      return error(res, "Not authorized", 403);
    }
  };
};

/**
 * Guards the gallery/artist reorder endpoints, which carry no event id in the
 * path — only a `{ items: [{ id, sort_order }] }` body. Verifies every listed
 * row belongs to an event owned by the logged-in organiser. `table` is
 * 'event_gallery' or 'event_artists'.
 */
export const ensureOrganiserOwnsMediaItems = (table) => async (req, res, next) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const ids = items.map((i) => Number(i?.id)).filter(Boolean);
    if (!ids.length) return next();

    const placeholders = ids.map(() => "?").join(", ");
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS bad
       FROM \`${table}\` m
       JOIN events e ON e.id = m.event_id
       WHERE m.id IN (${placeholders})
         AND e.organizer_id <> ?`,
      [...ids, req.organiser.organizer.id]
    );
    if (rows[0].bad > 0) {
      return error(res, "Not authorized: some items belong to another organiser", 403);
    }
    next();
  } catch (err) {
    console.error("ensureOrganiserOwnsMediaItems error:", err.message);
    return error(res, "Not authorized", 403);
  }
};
