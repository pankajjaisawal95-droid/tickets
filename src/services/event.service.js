import pool from '../config/database.js';

export const getEventService = async (eventId=1,limit = 10, offset = 0) => {
  const [rows] = await pool.query(
    `
    SELECT 
      e.id,
      e.title,
      e.description,
      e.start_datetime,
      e.end_datetime,
      e.venue,
      e.banner_url,e.cart_url,
      e.presented_by,

      c.id AS city_id,
      c.name AS city,

      s.id AS state_id,
      s.name AS state,

      d.id AS district_id,
      d.name AS district,

      cat.id AS category_id,
      cat.name AS category

    FROM events e

    LEFT JOIN cities c
      ON c.id = e.city_id AND c.status = 1

    LEFT JOIN districts d
      ON d.id = e.district_id AND d.status = 1

    LEFT JOIN states s
      ON s.id = d.state_id AND s.status = 1

    LEFT JOIN event_categories cat
      ON cat.id = e.category_id

    WHERE 
      e.approval_status = 'APPROVED'
      AND e.is_active = 1
      AND e.id = ?

    ORDER BY e.start_datetime DESC
    LIMIT ? OFFSET ?
    `,
    [Number(eventId),Number(limit), Number(offset)]
  );

  // attach per-event gallery + artists
  if (rows.length) {
    const ids = rows.map((r) => r.id);
    const ph = ids.map(() => "?").join(",");

    const [gallery] = await pool.query(
      `SELECT event_id, image_url, caption
       FROM event_gallery
       WHERE event_id IN (${ph}) AND status = 1
       ORDER BY sort_order ASC, id ASC`,
      ids
    );
    const [artists] = await pool.query(
      `SELECT event_id, name, image_url, role
       FROM event_artists
       WHERE event_id IN (${ph}) AND status = 1
       ORDER BY sort_order ASC, id ASC`,
      ids
    );

    const gMap = {};
    const aMap = {};
    for (const g of gallery) (gMap[g.event_id] ||= []).push({ image: g.image_url, caption: g.caption });
    for (const a of artists) (aMap[a.event_id] ||= []).push({ name: a.name, image: a.image_url, role: a.role });

    for (const r of rows) {
      r.gallery = gMap[r.id] || [];
      r.artists = aMap[r.id] || [];
    }
  }

  return rows; // ✅ RETURN ARRAY (pagination)
};

export const getTicketTypesByEventService = async (eventId) => {
  const [rows] = await pool.query(
    `
    SELECT
      tt.id,
      tt.name,
      tt.description,
      tt.price,
      tt.image,
      tt.total_quantity,
      tt.max_per_user,
      tt.seating_mode,

      -- only PAID + unexpired HOLD orders consume stock (matches pricing engine);
      -- cancelled/refunded/expired free their seats. Clamp to 0 so it never goes negative.
      GREATEST(
        tt.total_quantity - IFNULL(SUM(
          CASE
            WHEN o.status = 'PAID'
              OR (o.status = 'HOLD' AND o.hold_expires_at > NOW())
            THEN oi.quantity
            ELSE 0
          END
        ), 0),
        0
      ) AS available_quantity

    FROM ticket_types tt

    INNER JOIN events e
      ON e.id = tt.event_id

    LEFT JOIN order_items oi
      ON oi.ticket_type_id = tt.id

    LEFT JOIN orders o
      ON o.id = oi.order_id

    WHERE
      tt.event_id = ?
      AND tt.status = 1
      AND e.approval_status = 'APPROVED'
      AND e.is_active = 1
      AND (tt.sale_start IS NULL OR tt.sale_start <= NOW())
      AND (tt.sale_end IS NULL OR tt.sale_end >= NOW())

    GROUP BY tt.id
    ORDER BY tt.price ASC
    `,
    [eventId]
  );

  return rows;
};
/**
 * Public seat map for a SEATED ticket type: every active seat with a `taken`
 * flag. A seat is taken when it belongs to a live order (PAID or unexpired
 * HOLD) — the same liveness rule the pricing engine uses for quantity, so the
 * map matches what create-order will accept.
 */
export const getSeatMapService = async (ticketTypeId) => {
  const [rows] = await pool.query(
    `
    SELECT
      s.id,
      s.seat_label,
      s.row_label,
      s.col_number,
      EXISTS(
        SELECT 1 FROM order_seats os
        JOIN orders o ON o.id = os.order_id
        WHERE os.seat_id = s.id
          AND ( o.status = 'PAID'
                OR (o.status = 'HOLD' AND o.hold_expires_at > NOW()) )
      ) AS taken
    FROM seats s
    WHERE s.ticket_type_id = ? AND s.status = 1
    ORDER BY s.row_label ASC, s.col_number ASC
    `,
    [ticketTypeId]
  );

  // Normalise taken to a boolean for the client.
  return rows.map((r) => ({ ...r, taken: Boolean(Number(r.taken)) }));
};

/**
 * Whole-event seat map: every SEATED ticket type plus all its seats (with a
 * `taken` flag) in one payload, so the frontend can draw the entire venue
 * layout (all sections A–U) in a single chart. Seats keep their ticket_type_id
 * so the picker knows each seat's section/price.
 */
export const getEventSeatMapService = async (eventId) => {
  const [ticketTypes] = await pool.query(
    `SELECT id, name, price, max_per_user
     FROM ticket_types
     WHERE event_id = ? AND status = 1 AND seating_mode = 'SEATED'
     ORDER BY price DESC, id ASC`,
    [eventId]
  );

  if (!ticketTypes.length) return { ticketTypes: [], seats: [] };

  const [seats] = await pool.query(
    `SELECT s.id, s.ticket_type_id, s.seat_label, s.row_label, s.col_number,
            EXISTS(
              SELECT 1 FROM order_seats os
              JOIN orders o ON o.id = os.order_id
              WHERE os.seat_id = s.id
                AND ( o.status = 'PAID'
                      OR (o.status = 'HOLD' AND o.hold_expires_at > NOW()) )
            ) AS taken
     FROM seats s
     JOIN ticket_types tt ON tt.id = s.ticket_type_id
     WHERE s.event_id = ? AND s.status = 1
       AND tt.status = 1 AND tt.seating_mode = 'SEATED'
     ORDER BY s.row_label ASC, s.col_number ASC`,
    [eventId]
  );

  return {
    ticketTypes,
    seats: seats.map((s) => ({ ...s, taken: Boolean(Number(s.taken)) }))
  };
};

export const getEventForValidatorService = async (
  validatorId
) => {
  if (!validatorId) {
    throw new Error("eventId and validatorId are required");
  }

  const [rows] = await pool.query(
    `
    SELECT 
        e.id,
        e.title,
        e.description,
        e.start_datetime,
        e.end_datetime,
        e.venue,
        e.banner_url,e.presented_by,

        tv.id AS validator_id,
        tv.mobile,
        tv.device_name,
        tv.is_verified,
        tv.status

    FROM events e

    INNER JOIN ticket_validator tv 
        ON tv.event_id = e.id

    WHERE 
        tv.id = ?
        AND tv.is_verified = 1
        AND tv.status = 'ACTIVE'
        AND e.approval_status = 'APPROVED'
        AND e.is_active = 1
    `,
    [Number(validatorId)]
  );

  return rows[0] || null; // single result
};

