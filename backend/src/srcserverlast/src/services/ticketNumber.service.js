import pool from "../config/database.js";

/**
 * Insert ticket numbers entry
 * @param {Object} conn - existing DB connection (optional)
 * @param {number} ticketId
 * @param {number} ticketTypeId
 * @param {number} quantity
 */
export const insertTicketNumber = async (
  conn,
  ticketId,
  ticketTypeId,
  quantity
) => {
  try {
    // 🔥 Important: we are using existing transaction connection
    await conn.query(
      `
      INSERT INTO ticket_numbers (
        ticket_id,
        ticket_type_id,
        available,
        used,
        status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, 0, 1, NOW(), NOW())
      `,
      [ticketId, ticketTypeId, quantity]
    );

    return true;

  } catch (error) {
    throw error;
  }
};