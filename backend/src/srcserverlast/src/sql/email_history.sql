-- Email history: one row per email send attempt (ticket confirmations, etc.)
-- Created automatically at startup by ensureEmailHistoryTable(); kept here for
-- manual setup / reference.
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
