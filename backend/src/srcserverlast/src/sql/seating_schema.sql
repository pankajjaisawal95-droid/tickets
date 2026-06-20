-- Reserved-seat booking, layered on top of the existing quantity (GA) flow.
-- Mirrors ensureSeatingSchema() in src/services/schema.service.js.
-- A seat is "taken" when an order_seats row points to an order that is PAID or
-- (HOLD AND hold_expires_at > NOW()).

-- A ticket type is GA (default, current behaviour) or SEATED.
ALTER TABLE `ticket_types`
  ADD COLUMN `seating_mode` VARCHAR(10) NOT NULL DEFAULT 'GA';

-- One row per physical seat of a SEATED ticket type.
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Links a booked order line to its seats.
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
