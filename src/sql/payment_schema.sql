-- Payment module schema (canonical reference).
-- Applied automatically & idempotently at startup by ensurePaymentSchema()
-- (src/services/schema.service.js). Kept here for manual setup / DBA review.
-- NOTE: MySQL has no "ADD COLUMN IF NOT EXISTS"; the ensure-service checks
-- information_schema first. Run these by hand only on a fresh/known schema.

/* ---- orders: full price breakdown + lifecycle ---- */
ALTER TABLE orders
  ADD COLUMN subtotal        DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN discount_code   VARCHAR(40)   NULL,
  ADD COLUMN discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN convenience_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN tax_percent     DECIMAL(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN tax_amount      DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN currency        CHAR(3)       NOT NULL DEFAULT 'INR';

/* ---- order_items: per-line money truth (legacy `price` kept = line_total) ---- */
ALTER TABLE order_items
  ADD COLUMN unit_price      DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN gst_percent     DECIMAL(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN gst_amount      DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN line_total      DECIMAL(12,2) NOT NULL DEFAULT 0;

/* ---- dynamic tax/fee rules (NULL = inherit/none -> plain amount) ---- */
ALTER TABLE ticket_types ADD COLUMN gst_percent DECIMAL(5,2) NULL;
ALTER TABLE events
  ADD COLUMN gst_percent             DECIMAL(5,2)  NULL,
  ADD COLUMN convenience_fee_percent DECIMAL(5,2)  NULL,
  ADD COLUMN convenience_fee_flat    DECIMAL(10,2) NULL,
  ADD COLUMN gst_inclusive           TINYINT(1)    NOT NULL DEFAULT 0;

/* ---- payments: single source of truth + idempotent ---- */
ALTER TABLE payments
  ADD COLUMN currency        CHAR(3)       NOT NULL DEFAULT 'INR',
  ADD COLUMN method          VARCHAR(30)   NULL,
  ADD COLUMN amount_refunded DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN captured_at     DATETIME      NULL,
  ADD UNIQUE KEY uq_gateway_payment (gateway_payment_id),
  ADD KEY idx_gateway_order (gateway_order_id);

/* ---- new tables: see schema.service.js for the exact CREATE statements ---- */
-- coupons, coupon_redemptions, refunds, payment_events, order_status_history
