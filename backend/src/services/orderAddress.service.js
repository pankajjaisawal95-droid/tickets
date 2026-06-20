import pool from "../config/database.js";

/**
 * Per-order delivery/visitor address tracking.
 *
 * Lifecycle:
 *   1. Order created   → saveOrderAddress()            (status = CREATED)
 *   2. Order confirmed → updateOrderAddressStatus()    (status = CONFIRMED)
 *      Order failed    → updateOrderAddressStatus()    (status = FAILED)
 *   3. Ticket issued   → attachTicketToOrderAddress()  (stores ticket_id)
 *
 * Every function here is BACKGROUND-SAFE: it swallows/logs errors and never
 * throws, so address tracking can never break order creation, payment
 * verification or ticket generation.
 */

/** Creates the order_addresses table if it doesn't exist. Call once at startup. */
export const ensureOrderAddressTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_addresses (
        id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        order_id    BIGINT UNSIGNED NOT NULL,
        user_id     BIGINT UNSIGNED NULL,
        latitude    DECIMAL(10,7)   NULL,
        longitude   DECIMAL(10,7)   NULL,
        address     VARCHAR(255)    NULL,
        city        VARCHAR(100)    NULL,
        region      VARCHAR(100)    NULL,
        state       VARCHAR(100)    NULL,
        postal_code VARCHAR(20)     NULL,
        country     CHAR(2)         NULL,
        status      VARCHAR(20)     NOT NULL DEFAULT 'CREATED',
        ticket_id   BIGINT UNSIGNED NULL,
        created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_order (order_id),
        KEY idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Backfill columns for installs created before they existed.
    await ensureColumn("order_addresses", "state", "VARCHAR(100) NULL AFTER region");
    await ensureColumn("order_addresses", "postal_code", "VARCHAR(20) NULL AFTER state");

    console.log("📍 order address schema ready");
  } catch (err) {
    console.error("❌ ensureOrderAddressTable failed:", err.message);
  }
};

/**
 * Adds a column only if it doesn't already exist (MySQL has no
 * "ADD COLUMN IF NOT EXISTS"). Never throws — logs and continues.
 */
const ensureColumn = async (table, column, definition) => {
  try {
    const [rows] = await pool.query(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    if (rows.length === 0) {
      await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${column} ${definition}`);
    }
  } catch (err) {
    console.error(`❌ ensureColumn ${table}.${column} failed:`, err.message);
  }
};

/**
 * Stores the address captured at order-create time (status = CREATED).
 * Idempotent: re-creating the same order refreshes the stored address.
 */
export const saveOrderAddress = async ({ orderId, userId = null, location = {} } = {}) => {
  if (!orderId) return null;
  try {
    const lat = Number(location.latitude);
    const lng = Number(location.longitude);

    const [result] = await pool.query(
      `INSERT INTO order_addresses
         (order_id, user_id, latitude, longitude, address, city, region, state, postal_code, country, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CREATED')
       ON DUPLICATE KEY UPDATE
         latitude    = VALUES(latitude),
         longitude   = VALUES(longitude),
         address     = VALUES(address),
         city        = VALUES(city),
         region      = VALUES(region),
         state       = VALUES(state),
         postal_code = VALUES(postal_code),
         country     = VALUES(country)`,
      [
        orderId,
        userId,
        Number.isFinite(lat) ? lat : null,
        Number.isFinite(lng) ? lng : null,
        location.address ? String(location.address).slice(0, 255) : null,
        location.city || null,
        location.region || null,
        location.state || location.region || null,
        location.postalCode || location.postal_code || null,
        location.country || null,
      ]
    );
    return result.insertId || null;
  } catch (err) {
    console.error(`❌ saveOrderAddress failed (order ${orderId}):`, err.message);
    return null;
  }
};

/**
 * Updates the address record's status when the order is finalized.
 * `status` is typically 'CONFIRMED' (paid/free confirmed) or 'FAILED' (cancelled).
 */
export const updateOrderAddressStatus = async (orderId, status) => {
  if (!orderId || !status) return;
  try {
    await pool.query(
      `UPDATE order_addresses SET status = ? WHERE order_id = ?`,
      [status, orderId]
    );
  } catch (err) {
    console.error(`❌ updateOrderAddressStatus failed (order ${orderId}):`, err.message);
  }
};

/** Links the generated ticket to the order's address record. */
export const attachTicketToOrderAddress = async (orderId, ticketId) => {
  if (!orderId || !ticketId) return;
  try {
    await pool.query(
      `UPDATE order_addresses SET ticket_id = ? WHERE order_id = ?`,
      [ticketId, orderId]
    );
  } catch (err) {
    console.error(`❌ attachTicketToOrderAddress failed (order ${orderId}):`, err.message);
  }
};
