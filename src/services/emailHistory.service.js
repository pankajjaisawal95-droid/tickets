import pool from "../config/database.js";

/**
 * Email history store.
 *
 * Records one row per email send attempt so deliveries (and failures) are
 * auditable. Every write here is background-safe — a logging error must never
 * break the request that triggered the email.
 */

/**
 * Creates the email_history table if it doesn't exist. Called once at startup.
 * Mirrors src/sql/email_history.sql.
 */
export const ensureEmailHistoryTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_history (
        id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        email_type    VARCHAR(50)     NOT NULL DEFAULT 'GENERIC',
        recipient     VARCHAR(512)    NOT NULL,
        subject       VARCHAR(255)    NOT NULL,
        status        ENUM('SENT','FAILED','SKIPPED') NOT NULL DEFAULT 'SENT',
        message_id    VARCHAR(255)    DEFAULT NULL,
        error_message TEXT            DEFAULT NULL,
        order_id      BIGINT UNSIGNED DEFAULT NULL,
        event_id      BIGINT UNSIGNED DEFAULT NULL,
        user_id       BIGINT UNSIGNED DEFAULT NULL,
        ticket_id     BIGINT UNSIGNED DEFAULT NULL,
        created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_recipient (recipient(191)),
        KEY idx_status (status),
        KEY idx_email_type (email_type),
        KEY idx_order (order_id),
        KEY idx_event (event_id),
        KEY idx_user (user_id),
        KEY idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("📧 email_history table ready");
  } catch (err) {
    console.error("❌ Failed to ensure email_history table:", err.message);
  }
};

/**
 * Inserts a single email-history record. Never throws.
 *
 * @param {Object} entry
 * @param {string} [entry.emailType='GENERIC']
 * @param {string|string[]} entry.recipient
 * @param {string} entry.subject
 * @param {'SENT'|'FAILED'|'SKIPPED'} [entry.status='SENT']
 * @param {string} [entry.messageId]
 * @param {string} [entry.errorMessage]
 * @param {number} [entry.orderId]
 * @param {number} [entry.eventId]
 * @param {number} [entry.userId]
 * @param {number} [entry.ticketId]
 */
export const logEmail = async ({
  emailType = "GENERIC",
  recipient,
  subject,
  status = "SENT",
  messageId = null,
  errorMessage = null,
  orderId = null,
  eventId = null,
  userId = null,
  ticketId = null
}) => {
  try {
    const to = Array.isArray(recipient) ? recipient.join(", ") : recipient;

    await pool.query(
      `
      INSERT INTO email_history (
        email_type, recipient, subject, status,
        message_id, error_message,
        order_id, event_id, user_id, ticket_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        emailType,
        (to || "").slice(0, 512),
        (subject || "").slice(0, 255),
        status,
        messageId,
        errorMessage,
        orderId,
        eventId,
        userId,
        ticketId
      ]
    );
  } catch (err) {
    console.error("❌ email_history insert failed:", err.message);
  }
};

/**
 * Paginated, filterable list of email history (newest first).
 *
 * @param {Object} [opts]
 * @param {number} [opts.limit=50]   1–200
 * @param {number} [opts.offset=0]
 * @param {string} [opts.status]     SENT | FAILED | SKIPPED
 * @param {string} [opts.emailType]
 * @param {string} [opts.recipient]  partial match
 * @returns {Promise<{ rows: Array, total: number, limit: number, offset: number }>}
 */
export const getEmailHistory = async ({
  limit = 50,
  offset = 0,
  status,
  emailType,
  recipient
} = {}) => {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

  const where = [];
  const params = [];

  if (status) {
    where.push("status = ?");
    params.push(status);
  }
  if (emailType) {
    where.push("email_type = ?");
    params.push(emailType);
  }
  if (recipient) {
    where.push("recipient LIKE ?");
    params.push(`%${recipient}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `
    SELECT id, email_type, recipient, subject, status,
           message_id, error_message,
           order_id, event_id, user_id, ticket_id, created_at
    FROM email_history
    ${whereSql}
    ORDER BY created_at DESC, id DESC
    LIMIT ? OFFSET ?
    `,
    [...params, safeLimit, safeOffset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM email_history ${whereSql}`,
    params
  );

  return { rows, total, limit: safeLimit, offset: safeOffset };
};
