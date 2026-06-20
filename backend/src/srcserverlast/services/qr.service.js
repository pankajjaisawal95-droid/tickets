import pool from '../config/database.js';

export const get_detail = async (qrCode) => {
  const conn = await pool.getConnection();

  try {
    const [rows] = await conn.query(
      `
      SELECT 
        t.id AS eventTicketId,
        tn.id AS ticketId,
        t.event_id AS eventId,
        t.qr_code,qr_hash,
        tn.status,
        tn.ticket_type_id,
        tn.available AS available_ticket,
        tn.used AS used_ticket
      FROM tickets t
      JOIN ticket_numbers tn 
        ON tn.ticket_id = t.id
      WHERE t.qr_code = ? OR t.qr_hash = ?
      AND tn.status = 1
      `,
      [qrCode, qrCode]
    );

    return rows;

  } finally {
    conn.release();
  }
};