

export const createOrderRepo = async (conn, { userId, eventId }) => {
  
  const [res] = await conn.query(
    `
    INSERT INTO orders (
      user_id, event_id,
      status, payment_status, hold_expires_at
    )
    VALUES (?, ?, 'HOLD', 'PENDING', NOW() + INTERVAL 15 MINUTE)
    `,
    [userId, eventId]
  );

  return res.insertId;
};

export const lockTicketTypeRepo = async (
  conn,
  ticketTypeId,
  eventId
) => {
  const [[row]] = await conn.query(
    `
    SELECT id, price, total_quantity
    FROM ticket_types
    WHERE id = ? AND event_id = ? AND status = 1
    FOR UPDATE
    `,
    [ticketTypeId, eventId]
  );

  return row;
};

export const getUsedQuantityRepo = async (
  conn,
  ticketTypeId
) => {
  const [[row]] = await conn.query(
    `
    SELECT IFNULL(SUM(oi.quantity),0) AS used
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.ticket_type_id = ?
      AND o.status IN ('HOLD','PAID')
    `,
    [ticketTypeId]
  );

  return row.used;
};

/**
 * Persists one priced order line. `price` (legacy column) is kept equal to
 * line_total for backward compatibility with existing reads.
 */
export const insertOrderItemRepo = async (conn, orderId, line) => {
  const [res] = await conn.query(
    `
    INSERT INTO order_items (
      order_id, ticket_type_id, quantity,
      unit_price, gst_percent, discount_amount, gst_amount, line_total,
      price, json_data
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      orderId,
      line.ticket_type_id,
      line.quantity,
      line.unit_price,
      line.gst_percent,
      line.discount_amount,
      line.gst_amount,
      line.line_total,
      line.line_total,                 // legacy `price` = line total
      JSON.stringify(line)
    ]
  );
  return res.insertId;
};

/**
 * Records the specific seats a SEATED order line reserved. Called inside the
 * create-order transaction, while the seat rows are still locked FOR UPDATE by
 * the pricing engine — so two concurrent orders can never both insert the same
 * seat (the uq_seat_order key plus the live-order overlap check guard it).
 */
export const insertOrderSeatsRepo = async (conn, orderId, orderItemId, line) => {
  if (!Array.isArray(line.seat_ids) || line.seat_ids.length === 0) return;
  const values = line.seat_ids.map(() => "(?, ?, ?, ?)").join(", ");
  const params = [];
  for (const seatId of line.seat_ids) {
    params.push(orderId, orderItemId, seatId, line.ticket_type_id);
  }
  await conn.query(
    `INSERT INTO order_seats (order_id, order_item_id, seat_id, ticket_type_id)
     VALUES ${values}`,
    params
  );
};

/** Writes the full server-computed price breakdown onto the order. */
export const updateOrderPricingRepo = async (conn, orderId, pricing) => {
  await conn.query(
    `
    UPDATE orders SET
      subtotal        = ?,
      discount_code   = ?,
      discount_amount = ?,
      convenience_fee = ?,
      tax_percent     = ?,
      tax_amount      = ?,
      total_price     = ?,
      currency        = ?
    WHERE id = ?
    `,
    [
      pricing.subtotal,
      pricing.discount_code,
      pricing.discount_amount,
      pricing.convenience_fee,
      pricing.tax_percent,
      pricing.tax_amount,
      pricing.total,
      pricing.currency,
      orderId
    ]
  );
};
