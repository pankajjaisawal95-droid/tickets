import pool from "../config/database.js";

/**
 * Idempotent schema provisioning for the payment module.
 *
 * Runs at startup (mirrors ensureEmailHistoryTable). Each step is safe to run
 * repeatedly: columns are added only if missing (checked via information_schema),
 * new tables use CREATE TABLE IF NOT EXISTS. Background-safe — logs and continues
 * on error so a provisioning hiccup never blocks the server.
 *
 * Canonical DDL also lives in src/sql/payment_schema.sql for manual runs.
 */

const columnExists = async (table, column) => {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS c
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return row.c > 0;
};

const indexExists = async (table, index) => {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS c
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, index]
  );
  return row.c > 0;
};

/** Adds a column only if it doesn't already exist. */
const ensureColumn = async (table, column, ddl) => {
  if (await columnExists(table, column)) return;
  await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  console.log(`🧱 ${table}.${column} added`);
};

/** Adds an index/unique key only if it doesn't already exist. */
const ensureIndex = async (table, index, ddl) => {
  if (await indexExists(table, index)) return;
  try {
    await pool.query(`ALTER TABLE \`${table}\` ADD ${ddl}`);
    console.log(`🧱 ${table} index ${index} added`);
  } catch (err) {
    console.warn(`⚠️  Could not add index ${index} on ${table}: ${err.message}`);
  }
};

/**
 * Widens a status column to VARCHAR(24) so new lifecycle values (CREATED,
 * EXPIRED, REFUNDED, …) are accepted regardless of any pre-existing tight ENUM.
 * Idempotent and safe (ENUM/VARCHAR → wider VARCHAR preserves all values).
 */
const widenStatus = async (table, column, defaultLiteral) => {
  if (!(await columnExists(table, column))) return;
  try {
    await pool.query(
      `ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` VARCHAR(24) NOT NULL DEFAULT ${defaultLiteral}`
    );
  } catch (err) {
    console.warn(`⚠️  Could not widen ${table}.${column}: ${err.message}`);
  }
};

export const ensurePaymentSchema = async () => {
  try {
    /* ---- orders: full price breakdown + lifecycle ---- */
    await ensureColumn("orders", "subtotal",        "subtotal DECIMAL(12,2) NOT NULL DEFAULT 0");
    await ensureColumn("orders", "discount_code",   "discount_code VARCHAR(40) NULL");
    await ensureColumn("orders", "discount_amount", "discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0");
    await ensureColumn("orders", "convenience_fee", "convenience_fee DECIMAL(12,2) NOT NULL DEFAULT 0");
    await ensureColumn("orders", "tax_percent",     "tax_percent DECIMAL(5,2) NOT NULL DEFAULT 0");
    await ensureColumn("orders", "tax_amount",      "tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0");
    await ensureColumn("orders", "currency",        "currency CHAR(3) NOT NULL DEFAULT 'INR'");

    /* ---- order_items: per-line money truth (keep legacy `price` populated) ---- */
    await ensureColumn("order_items", "unit_price",      "unit_price DECIMAL(12,2) NOT NULL DEFAULT 0");
    await ensureColumn("order_items", "gst_percent",     "gst_percent DECIMAL(5,2) NOT NULL DEFAULT 0");
    await ensureColumn("order_items", "discount_amount", "discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0");
    await ensureColumn("order_items", "gst_amount",      "gst_amount DECIMAL(12,2) NOT NULL DEFAULT 0");
    await ensureColumn("order_items", "line_total",      "line_total DECIMAL(12,2) NOT NULL DEFAULT 0");

    /* ---- ticket_types & events: dynamic, optional tax/fee rules (NULL = inherit/none) ---- */
    await ensureColumn("ticket_types", "gst_percent", "gst_percent DECIMAL(5,2) NULL");
    // Max tickets of this type a single user may hold (NULL = unlimited)
    await ensureColumn("ticket_types", "max_per_user", "max_per_user INT NULL");
    await ensureColumn("events", "gst_percent",             "gst_percent DECIMAL(5,2) NULL");
    await ensureColumn("events", "convenience_fee_percent", "convenience_fee_percent DECIMAL(5,2) NULL");
    await ensureColumn("events", "convenience_fee_flat",    "convenience_fee_flat DECIMAL(10,2) NULL");
    await ensureColumn("events", "gst_inclusive",           "gst_inclusive TINYINT(1) NOT NULL DEFAULT 0");

    /* ---- widen status columns so new lifecycle values fit (ENUM-safe) ---- */
    await widenStatus("orders", "status", "'HOLD'");
    await widenStatus("orders", "payment_status", "'PENDING'");
    await widenStatus("payments", "status", "'CREATED'");

    /* ---- payments: single source of truth + idempotent ---- */
    await ensureColumn("payments", "currency",        "currency CHAR(3) NOT NULL DEFAULT 'INR'");
    await ensureColumn("payments", "method",          "method VARCHAR(30) NULL");
    await ensureColumn("payments", "amount_refunded", "amount_refunded DECIMAL(12,2) NOT NULL DEFAULT 0");
    await ensureColumn("payments", "captured_at",     "captured_at DATETIME NULL");
    await ensureIndex("payments", "uq_gateway_payment", "UNIQUE KEY uq_gateway_payment (gateway_payment_id)");
    await ensureIndex("payments", "idx_gateway_order",  "KEY idx_gateway_order (gateway_order_id)");

    /* ---- new tables ---- */
    await pool.query(`
      CREATE TABLE IF NOT EXISTS coupons (
        id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        code            VARCHAR(40)     NOT NULL,
        type            ENUM('PERCENT','FLAT') NOT NULL,
        value           DECIMAL(10,2)   NOT NULL,
        max_discount    DECIMAL(10,2)   NULL,
        event_id        BIGINT UNSIGNED NULL,
        ticket_type_id  BIGINT UNSIGNED NULL,
        min_qty         INT             NOT NULL DEFAULT 1,
        min_amount      DECIMAL(12,2)   NOT NULL DEFAULT 0,
        usage_limit     INT             NULL,
        per_user_limit  INT             NOT NULL DEFAULT 1,
        valid_from      DATETIME        NULL,
        valid_to        DATETIME        NULL,
        status          TINYINT(1)      NOT NULL DEFAULT 1,
        created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_code (code),
        KEY idx_scope (event_id, ticket_type_id, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS coupon_redemptions (
        id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        coupon_id   BIGINT UNSIGNED NOT NULL,
        user_id     BIGINT UNSIGNED NOT NULL,
        order_id    BIGINT UNSIGNED NOT NULL,
        amount      DECIMAL(12,2)   NOT NULL,
        created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_order (order_id),
        KEY idx_user_coupon (user_id, coupon_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Matches the existing refunds table shape (refund_amount/refund_type/
    // refund_reason/initiated_by, status enum INITIATED→COMPLETED).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS refunds (
        id                BIGINT(20)      NOT NULL AUTO_INCREMENT,
        payment_id        BIGINT(20)      NULL,
        order_id          BIGINT(20)      NULL,
        ticket_id         BIGINT(20)      NULL,
        refund_amount     DECIMAL(10,2)   NULL,
        refund_type       ENUM('FULL','PARTIAL') NULL,
        refund_reason     VARCHAR(255)    NULL,
        gateway_refund_id VARCHAR(150)    NULL,
        status            ENUM('INITIATED','PROCESSING','COMPLETED','FAILED') NULL DEFAULT 'INITIATED',
        initiated_by      BIGINT(20)      NULL,
        processed_at      DATETIME        NULL,
        created_at        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_order (order_id),
        KEY idx_payment (payment_id),
        KEY idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_events (
        id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        gateway            VARCHAR(20)     NOT NULL DEFAULT 'razorpay',
        event_id           VARCHAR(64)     NOT NULL,
        event_type         VARCHAR(60)     NOT NULL,
        gateway_order_id   VARCHAR(64)     NULL,
        gateway_payment_id VARCHAR(64)     NULL,
        payload            JSON            NOT NULL,
        processed          TINYINT(1)      NOT NULL DEFAULT 0,
        received_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_event (gateway, event_id),
        KEY idx_order (gateway_order_id),
        KEY idx_type (event_type, processed)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_status_history (
        id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        order_id    BIGINT UNSIGNED NOT NULL,
        from_status VARCHAR(24)     NULL,
        to_status   VARCHAR(24)     NOT NULL,
        note        VARCHAR(255)    NULL,
        created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_order (order_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    console.log("💳 payment schema ready");
  } catch (err) {
    console.error("❌ ensurePaymentSchema failed:", err.message);
  }
};

/**
 * Admin access concept. The admin guard keys off `users.role_id`; this just
 * guarantees the column exists (it normally does) so the check never throws on
 * a fresh DB. Promote a user to admin by setting their role_id to
 * `ADMIN_ROLE_ID` (default 2):  UPDATE users SET role_id = 2 WHERE mobile = ?;
 */
export const ensureAdminSchema = async () => {
  try {
    await ensureColumn("users", "role_id", "role_id INT NOT NULL DEFAULT 1");
    await ensureIndex("users", "idx_role", "KEY idx_role (role_id)");
    console.log("🔐 admin schema ready");
  } catch (err) {
    console.error("❌ ensureAdminSchema failed:", err.message);
  }
};

/**
 * Organiser self-service accounts. An organiser is a `users` row with
 * role_id = ORGANISER_ROLE_ID (default 3) and a password_hash (email + password
 * login, mirroring the admin flow), plus an `organizers` row holding the org
 * profile and KYC status. Admin promotes an organiser by approving their KYC
 * (organizers.kyc_status = 'APPROVED'). Idempotent — safe on every startup.
 */
export const ensureOrganiserSchema = async () => {
  try {
    // Organiser auth shares the users table (password_hash already used by admin).
    await ensureColumn("users", "password_hash", "password_hash VARCHAR(255) NULL");
    await ensureColumn("users", "email", "email VARCHAR(190) NULL");

    // Org profile + KYC. `organizers` may already exist (events.organizer_id FK);
    // CREATE IF NOT EXISTS keeps a fresh DB working, ensureColumn back-fills the
    // newer columns on an existing table.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS organizers (
        id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id           BIGINT UNSIGNED NULL,
        organization_name VARCHAR(190)    NOT NULL,
        contact_email     VARCHAR(190)    NULL,
        kyc_status        VARCHAR(24)     NOT NULL DEFAULT 'PENDING',
        status            TINYINT(1)      NOT NULL DEFAULT 1,
        created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await ensureColumn("organizers", "user_id", "user_id BIGINT UNSIGNED NULL");
    await ensureColumn("organizers", "contact_email", "contact_email VARCHAR(190) NULL");
    await ensureColumn("organizers", "kyc_status", "kyc_status VARCHAR(24) NOT NULL DEFAULT 'PENDING'");
    await ensureColumn("organizers", "status", "status TINYINT(1) NOT NULL DEFAULT 1");
    await ensureColumn("organizers", "created_at", "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
    await ensureIndex("organizers", "uq_user", "UNIQUE KEY uq_user (user_id)");

    // KYC + bank payout details (filled from the organiser dashboard, reviewed by
    // an admin who flips kyc_status to APPROVED). Doc URLs point at /assets uploads.
    await ensureColumn("organizers", "pan", "pan VARCHAR(20) NULL");
    await ensureColumn("organizers", "gst_number", "gst_number VARCHAR(20) NULL");
    await ensureColumn("organizers", "bank_account_holder", "bank_account_holder VARCHAR(190) NULL");
    await ensureColumn("organizers", "bank_account_number", "bank_account_number VARCHAR(34) NULL");
    await ensureColumn("organizers", "bank_ifsc", "bank_ifsc VARCHAR(15) NULL");
    await ensureColumn("organizers", "bank_name", "bank_name VARCHAR(120) NULL");
    await ensureColumn("organizers", "pan_doc_url", "pan_doc_url VARCHAR(512) NULL");
    await ensureColumn("organizers", "gst_doc_url", "gst_doc_url VARCHAR(512) NULL");
    await ensureColumn("organizers", "kyc_submitted_at", "kyc_submitted_at DATETIME NULL");

    // Extra event fields collected by the organiser create-event wizard
    // (Date & Venue + Contact tabs). Additive + idempotent.
    await ensureColumn("events", "visibility", "visibility VARCHAR(20) NOT NULL DEFAULT 'public'");
    await ensureColumn("events", "city", "city VARCHAR(120) NULL");
    await ensureColumn("events", "state", "state VARCHAR(120) NULL");
    await ensureColumn("events", "country", "country VARCHAR(80) NULL");
    await ensureColumn("events", "contact_person", "contact_person VARCHAR(190) NULL");
    await ensureColumn("events", "contact_number", "contact_number VARCHAR(20) NULL");
    await ensureColumn("events", "contact_email", "contact_email VARCHAR(190) NULL");
    await ensureColumn("events", "internal_notes", "internal_notes TEXT NULL");

    console.log("🎫 organiser schema ready");
  } catch (err) {
    console.error("❌ ensureOrganiserSchema failed:", err.message);
  }
};

/**
 * Per-event media: gallery photos + artist lineup. Idempotent.
 */
export const ensureEventMediaTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS event_gallery (
        id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        event_id   BIGINT UNSIGNED NOT NULL,
        image_url  VARCHAR(512)    NOT NULL,
        caption    VARCHAR(255)    NULL,
        sort_order INT             NOT NULL DEFAULT 0,
        status     TINYINT(1)      NOT NULL DEFAULT 1,
        created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_event (event_id, status, sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS event_artists (
        id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        event_id   BIGINT UNSIGNED NOT NULL,
        name       VARCHAR(150)    NOT NULL,
        image_url  VARCHAR(512)    NULL,
        role       VARCHAR(100)    NULL,
        sort_order INT             NOT NULL DEFAULT 0,
        status     TINYINT(1)      NOT NULL DEFAULT 1,
        created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_event (event_id, status, sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    console.log("🖼️  event media schema ready");
  } catch (err) {
    console.error("❌ ensureEventMediaTables failed:", err.message);
  }
};

/**
 * Reserved-seat booking, layered ON TOP of the existing quantity (GA) flow.
 *
 * A ticket type is GA by default (seating_mode = 'GA', current behaviour) or
 * SEATED. Seated lines still populate order_items.quantity (= seat count), so
 * availability math, per-user caps, pricing and count-based scanning all keep
 * working; `seats` + `order_seats` only record *which* seats are taken.
 *
 * A seat is "taken" when an order_seats row points to an order that is PAID or
 * (HOLD AND hold_expires_at > NOW()) — the same liveness rule the pricing
 * engine uses for quantity. Expired holds free their seats automatically.
 *
 * Idempotent (mirrors ensurePaymentSchema). Canonical DDL: src/sql/seating_schema.sql.
 */
export const ensureSeatingSchema = async () => {
  try {
    /* ---- ticket_types: GA (default) vs SEATED ---- */
    await ensureColumn(
      "ticket_types",
      "seating_mode",
      "seating_mode VARCHAR(10) NOT NULL DEFAULT 'GA'"
    );

    /* ---- sale window optional: NULL = always on sale. The old default was
            current_timestamp, so a new ticket type expired the instant it was
            created. Relax to NULL DEFAULT NULL. Idempotent. ---- */
    for (const col of ["sale_start", "sale_end"]) {
      if (await columnExists("ticket_types", col)) {
        try {
          await pool.query(
            `ALTER TABLE ticket_types MODIFY COLUMN \`${col}\` DATETIME NULL DEFAULT NULL`
          );
        } catch (e) {
          console.warn(`⚠️  Could not relax ticket_types.${col}: ${e.message}`);
        }
      }
    }

    /* ---- seats: one row per physical seat of a SEATED ticket type ---- */
    await pool.query(`
      CREATE TABLE IF NOT EXISTS seats (
        id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        event_id       BIGINT UNSIGNED NOT NULL,
        ticket_type_id BIGINT UNSIGNED NOT NULL,
        seat_label     VARCHAR(16)     NOT NULL,
        row_label      VARCHAR(8)      NOT NULL,
        col_number     INT             NOT NULL,
        status         TINYINT(1)      NOT NULL DEFAULT 1,
        created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_seat (ticket_type_id, seat_label),
        KEY idx_event (event_id),
        KEY idx_type (ticket_type_id, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    /* ---- order_seats: links a booked order line to its seats ---- */
    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_seats (
        id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        order_id       BIGINT UNSIGNED NOT NULL,
        order_item_id  BIGINT UNSIGNED NULL,
        seat_id        BIGINT UNSIGNED NOT NULL,
        ticket_type_id BIGINT UNSIGNED NOT NULL,
        created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_seat_order (seat_id, order_id),
        KEY idx_order (order_id),
        KEY idx_seat (seat_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    console.log("💺 seating schema ready");
  } catch (err) {
    console.error("❌ ensureSeatingSchema failed:", err.message);
  }
};
