# Payment Module — Technical Audit & Schema Redesign

**Scope:** end-to-end booking → payment → fulfilment → refund, both backend (`backend/src`) and frontend (`frontend/src`).
**Stack:** Express 5 + mysql2 (raw SQL, no migrations) · Razorpay · React (Vite) + Zustand.
**Status:** ⚠️ Not production-ready. Several **money-correctness** and **fulfilment-reliability** defects below are blockers.

---

## 0. Current flow (as built)

```
FE TicketSummary.handlePay()
  └─ POST /order/create-order { eventId, tickets[] }
       └─ createOrderService: HOLD order → price = Σ(price×qty) → Razorpay order → save payment_order_id
  └─ Razorpay checkout (order_id = rzpOrder.id, amount = order.amount*100  ← ignored when order_id present)
  └─ handler → POST /order/verify-payment { razorpay_*; bookingId }
       └─ verifyPaymentService: signature check → orders.status='PAID'
  └─ order.controller.verifyPayment → createTicketService(bookingId)  ← tickets minted here, synchronously
```

Parallel, **unused-by-frontend** path: `/payment/initiate` (`initiatePaymentService`) + `/payment/webhook` (`paymentWebhook`). The `payments` table is **only** written here, so in the live flow it is never populated.

---

## 1. Missing Tables

| Table | Why it's needed | Severity |
|---|---|---|
| `refunds` | No refund record/audit anywhere. PAID cancellations return no money and leave no trail. | 🔴 |
| `coupons` | "Discount … dynamically by event/ticket-type rule" is impossible — no store for rules. | 🔴 |
| `coupon_redemptions` | Enforce per-user / global usage limits; prevent reuse. | 🟠 |
| `payment_events` (webhook log) | Reconciliation & idempotency need a raw, immutable gateway-event log. | 🔴 |
| `order_status_history` | Audit trail for HOLD→PAID→REFUNDED transitions (disputes/chargebacks). | 🟡 |
| `tax_rules` *(optional)* | If GST varies by HSN/SAC or state; otherwise columns on event/ticket_type suffice. | 🟡 |

The `payments` table **exists** but is effectively dead in the live path — see §9.

---

## 2. Missing / Broken Columns

| Table | Column | Problem |
|---|---|---|
| `orders` | `subtotal`, `discount_amount`, `discount_code`, `convenience_fee`, `tax_amount`, `tax_percent`, `currency` | Only `total_price` is stored. Discount/fee/GST shown on FE are **never persisted or charged**. No GST is actually collected or recorded. |
| `orders` | `status` vs `order_status` | `verifyPaymentService`/`cancelOrderService` write `status`; `paymentWebhook` writes `order_status`. **Two competing state columns.** Pick one. |
| `orders` | `REFUNDED`, `EXPIRED` states | `status` enum lacks refund/expiry terminal states. |
| `order_items` | `gst_percent`, `gst_amount`, `discount_amount`, `line_total` (and rename `price`→`unit_price`) | No per-line tax/discount; `price` ambiguously holds the **line total** (`order.repository.js:68` inserts `data.total`) while `ticket.service.js:171` reads it as `line_total`. Naming lies. |
| `ticket_types` | `gst_percent`, `convenience_fee_percent` (nullable overrides) | No per-ticket-type tax rule → can't do "dynamic by ticket type". |
| `events` | `gst_percent`, `convenience_fee_percent`, `convenience_fee_flat`, `gst_inclusive` | No event-level pricing config → can't do "dynamic by event; if unset, plain amount". |
| `payments` | `gateway_payment_id UNIQUE`, `currency`, `method`, `amount_refunded`, `captured_at` | No unique constraint → replay/duplicate risk; no partial-refund accounting. |
| `tickets` | `quantity` | Referenced in `updateTicketQuantityService` (`ticket.service.js:213`) but **never created or inserted** — dead/missing column. Remove the function or add the column. |

---

## 3. ALTER TABLE Statements (incremental, safe on existing data)

```sql
-- 3.1 orders: persist the full price breakdown + lifecycle
ALTER TABLE orders
  ADD COLUMN subtotal         DECIMAL(12,2)  NOT NULL DEFAULT 0 AFTER event_id,
  ADD COLUMN discount_code    VARCHAR(40)    NULL        AFTER subtotal,
  ADD COLUMN discount_amount  DECIMAL(12,2)  NOT NULL DEFAULT 0 AFTER discount_code,
  ADD COLUMN convenience_fee  DECIMAL(12,2)  NOT NULL DEFAULT 0 AFTER discount_amount,
  ADD COLUMN tax_percent      DECIMAL(5,2)   NOT NULL DEFAULT 0 AFTER convenience_fee,
  ADD COLUMN tax_amount       DECIMAL(12,2)  NOT NULL DEFAULT 0 AFTER tax_percent,
  ADD COLUMN currency         CHAR(3)        NOT NULL DEFAULT 'INR' AFTER total_price,
  MODIFY COLUMN status ENUM('HOLD','PAID','CANCELLED','EXPIRED','REFUNDED','PARTIALLY_REFUNDED')
                 NOT NULL DEFAULT 'HOLD';
-- Drop the redundant second state column AFTER migrating webhook to use `status`:
-- ALTER TABLE orders DROP COLUMN order_status;

-- 3.2 order_items: per-line money truth (fix the price/line_total naming)
ALTER TABLE order_items
  CHANGE COLUMN price unit_price DECIMAL(12,2) NOT NULL,
  ADD COLUMN gst_percent     DECIMAL(5,2)  NOT NULL DEFAULT 0 AFTER unit_price,
  ADD COLUMN discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER gst_percent,
  ADD COLUMN gst_amount      DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER discount_amount,
  ADD COLUMN line_total      DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER gst_amount;

-- 3.3 ticket_types & events: dynamic, optional tax/fee rules (NULL = inherit/none)
ALTER TABLE ticket_types
  ADD COLUMN gst_percent DECIMAL(5,2) NULL AFTER price;

ALTER TABLE events
  ADD COLUMN gst_percent             DECIMAL(5,2)  NULL,
  ADD COLUMN convenience_fee_percent DECIMAL(5,2)  NULL,
  ADD COLUMN convenience_fee_flat    DECIMAL(10,2) NULL,
  ADD COLUMN gst_inclusive           TINYINT(1)    NOT NULL DEFAULT 0;

-- 3.4 payments: make it the single source of truth + idempotent
ALTER TABLE payments
  ADD COLUMN currency        CHAR(3)       NOT NULL DEFAULT 'INR' AFTER amount,
  ADD COLUMN method          VARCHAR(30)   NULL,
  ADD COLUMN amount_refunded DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN captured_at     DATETIME      NULL,
  MODIFY COLUMN status ENUM('CREATED','PENDING','SUCCESS','FAILED','REFUNDED','PARTIALLY_REFUNDED')
                 NOT NULL DEFAULT 'CREATED',
  ADD UNIQUE KEY uq_gateway_payment (gateway_payment_id),
  ADD KEY idx_gateway_order (gateway_order_id);

-- 3.5 remove dead column reference
-- (either) ALTER TABLE tickets ADD COLUMN quantity INT NULL;
-- (or) delete updateTicketQuantityService — recommended.
```

---

## 4. Recommended Schema Changes — new tables

```sql
-- 4.1 Coupons: dynamic discount rules (per event / ticket type / global)
CREATE TABLE coupons (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code            VARCHAR(40)     NOT NULL,
  type            ENUM('PERCENT','FLAT') NOT NULL,
  value           DECIMAL(10,2)   NOT NULL,
  max_discount    DECIMAL(10,2)   NULL,          -- cap for PERCENT
  event_id        BIGINT UNSIGNED NULL,          -- NULL = all events
  ticket_type_id  BIGINT UNSIGNED NULL,          -- NULL = all types
  min_qty         INT             NOT NULL DEFAULT 1,
  min_amount      DECIMAL(12,2)   NOT NULL DEFAULT 0,
  usage_limit     INT             NULL,          -- global redemptions
  per_user_limit  INT             NOT NULL DEFAULT 1,
  valid_from      DATETIME        NULL,
  valid_to        DATETIME        NULL,
  status          TINYINT(1)      NOT NULL DEFAULT 1,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_code (code),
  KEY idx_scope (event_id, ticket_type_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4.2 Redemptions: enforce limits + audit
CREATE TABLE coupon_redemptions (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  coupon_id   BIGINT UNSIGNED NOT NULL,
  user_id     BIGINT UNSIGNED NOT NULL,
  order_id    BIGINT UNSIGNED NOT NULL,
  amount      DECIMAL(12,2)   NOT NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_order (order_id),               -- one coupon per order
  KEY idx_user_coupon (user_id, coupon_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4.3 Refunds: full lifecycle + gateway linkage
CREATE TABLE refunds (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id         BIGINT UNSIGNED NOT NULL,
  payment_id       BIGINT UNSIGNED NOT NULL,
  ticket_id        BIGINT UNSIGNED NULL,         -- partial (per-ticket) refund
  gateway_refund_id VARCHAR(64)    NULL,
  amount           DECIMAL(12,2)   NOT NULL,
  reason           VARCHAR(255)    NULL,
  status           ENUM('REQUESTED','PROCESSING','PROCESSED','FAILED') NOT NULL DEFAULT 'REQUESTED',
  requested_by     BIGINT UNSIGNED NULL,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at     DATETIME        NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gateway_refund (gateway_refund_id),
  KEY idx_order (order_id),
  KEY idx_payment (payment_id),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4.4 Webhook/event log: idempotent reconciliation
CREATE TABLE payment_events (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  gateway       VARCHAR(20)     NOT NULL DEFAULT 'razorpay',
  event_id      VARCHAR(64)     NOT NULL,        -- Razorpay event id (idempotency key)
  event_type    VARCHAR(60)     NOT NULL,        -- payment.captured, refund.processed, …
  gateway_order_id   VARCHAR(64) NULL,
  gateway_payment_id VARCHAR(64) NULL,
  payload       JSON            NOT NULL,
  processed      TINYINT(1)     NOT NULL DEFAULT 0,
  received_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_event (gateway, event_id),       -- dedupe redeliveries
  KEY idx_order (gateway_order_id),
  KEY idx_type (event_type, processed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4.5 Order status history (optional but recommended)
CREATE TABLE order_status_history (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id   BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(24)    NULL,
  to_status   VARCHAR(24)    NOT NULL,
  note       VARCHAR(255)    NULL,
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 5. Business Logic Gaps

| # | Gap | Evidence | Fix |
|---|---|---|---|
| B1 | **Tickets minted only on the synchronous verify call.** If the browser dies after payment but before `/order/verify-payment`, money is captured but no ticket and order stays HOLD. | `order.controller.js:79` calls `createTicketService` only inside `verifyPayment`. Webhook does **not** mint tickets. | Make the **webhook** the authoritative fulfilment trigger (idempotent), with verify as a fast-path. |
| B2 | **Expired holds never released.** Availability counts `status IN ('HOLD','PAID')` regardless of `hold_expires_at`. | `order.repository.js:43-52` (`getUsedQuantityRepo`). | Add a cron to flip stale HOLD→EXPIRED, **or** exclude `hold_expires_at < NOW()` from the used-quantity sum. |
| B3 | **No tickets created in webhook path** despite the "🎟️ TICKET CREATED HERE" comment. | `payment.webhook.js:78`. | Call `createTicketService` in webhook on first SUCCESS. |
| B4 | **Cancel contradicts policy.** Terms say "cannot be cancelled" but a Cancel button + `/ticket/cancle-ticket` exist; cancelling a ticket does **not** refund, **not** restore inventory, **not** update order. | `Booking.jsx` terms vs `MyTicketCard.jsx`; `cancelTicketService` (`ticket.service.js`). | Define one policy; wire cancel → refund + inventory restore (§7). |
| B5 | **No sale-window / per-user cap enforcement.** `ticket_types.sale_start/sale_end` and any max-per-user are never checked. | `createOrderService` loop. | Validate window + caps at order creation. |
| B6 | **Free-ticket path** (`freeTicketService`) bypasses orders/payments entirely and writes `tickets.ticket_type_id` (different shape than paid). | `ticket.service.js:542+`. | Acceptable, but unify reporting (treat as ₹0 order or flag clearly). |

---

## 6. Security Issues

| # | Severity | Issue | Evidence | Fix |
|---|---|---|---|---|
| S1 | 🔴 | **Razorpay SECRET key shipped to the browser.** | `frontend/.env.local: VITE_RAZORPAY_KEY_SECRET=…` | Delete it from the frontend entirely. Only `VITE_RAZORPAY_KEY_ID` belongs client-side. Rotate the key — it's compromised. |
| S2 | 🔴 | **Webhook requires user auth** → Razorpay can never call it. | `payment.routes.js:13` mounts `requireHeaders+authenticate` on `/webhook`. | Remove auth; authenticate via **signature only**. |
| S3 | 🔴 | **Webhook can't verify signature** — global `express.json()` consumes the body; webhook needs the **raw** body. | `app.js:13` + `payment.webhook.js:18,22` (`req.body.toString()`). | Mount `express.raw({type:'application/json'})` on the webhook route **before** `express.json()`. |
| S4 | 🟠 | **No amount/captured-status assertion on verify.** Signature binds order↔payment but the captured amount/status isn't checked against `orders.total_price`. | `verifyPaymentService` (`order.service.js:208-278`). | After signature, fetch the payment from Razorpay (or webhook) and assert `status==='captured'` and `amount===round(total_price*100)`. |
| S5 | 🟠 | **Scan/USE/CANCEL by qrHash lacks role/ownership check.** A normal authenticated user can `POST /ticket/update-status {qrHash, action:'USE'\|'CANCEL'}`. | `ticket.controller.js:52` → `updateTicketStatusService` (no validator/role gate). | Restrict to verified validator role; verify event binding. |
| S6 | 🟡 | **Weak secrets / fallback secrets in code.** | `.env JWT_SECRET=super_secure_secret`; webhook fallback `"your_webhook_secret"`. | Strong env secrets; remove in-code fallbacks (fail closed). |
| S7 | 🟡 | Webhook default secret means an attacker who guesses it could forge events if the env var is unset. | `payment.webhook.js:7`. | Throw on missing `RAZORPAY_WEBHOOK_SECRET`. |

> ✅ Good: all SQL is parameterised (no SQL-injection found); `create-order` does **not** trust a client amount; per-type `FOR UPDATE` locking serialises inventory.

---

## 7. Pricing Calculation Issues

🔴 **The headline defect: the customer is shown one number and charged another.**

- FE `TicketSummary.jsx:26-29` computes
  `grandTotal = subtotal − discount(20% if qty≥3) + convenienceFee(2%, min ₹5) + gst(18% of fee)`
  and the button reads **"Proceed to Pay · ₹{grandTotal}"** (`:191`).
- BE `createOrderService` sets `totalAmount = Σ(price×qty)` = **subtotal only** (`order.service.js:55-68`), and the Razorpay order is created with that amount (`razorpay.gateway.js:17`).
- Razorpay checkout is opened with `order_id` present, so the client `amount: order.amount*100` (`TicketSummary.jsx:64`) is **ignored** — the gateway charges the **server** order amount = subtotal.

**Net effect:** discount, convenience fee and GST are **pure display fiction**. No GST is collected or recorded; the charge ≠ the displayed total. Also `Cart.jsx:49-50` uses `discount=0` while `TicketSummary` uses 20% — two different "truths" in the same app.

**Fix — one server-side pricing engine, used by both ends:**

1. Backend `calculatePricing(eventId, items, couponCode, userId)` returns a signed breakdown:
   `{ subtotal, discount_amount, convenience_fee, tax_percent, tax_amount, total, lines[] }`, derived from `events`/`ticket_types`/`coupons` rules. **If no rule is configured → discount=fee=tax=0 → "plain amount"** (exactly the requested behaviour).
2. `POST /order/quote` returns that breakdown; the FE renders the **server** numbers (no client math).
3. `create-order` recomputes server-side, persists every component into `orders`/`order_items`, and creates the Razorpay order from the **final total** (incl. fee + GST).
4. `verify-payment` asserts captured amount == persisted `orders.total_price` (S4).

This makes the displayed total, the charged total, and the stored total identical — "fully verify amount" satisfied, on both ends.

---

## 8. Refund Logic Issues

- ❌ No `refunds` table, no Razorpay refund call anywhere.
- ❌ `cancelTicketService` sets `tickets.status='CANCELLED'` only — **no money back, no inventory return, no order/payment update** (`ticket.service.js:255-292`).
- ❌ PAID orders are hard-blocked from cancellation (`order.service.js:179-181`), so the only "cancel" path is the ticket one that does nothing financial.
- ❌ Inventory isn't restored on cancel: availability counts `order_items` of PAID orders; cancelling a *ticket* doesn't touch `order_items`/`ticket_numbers`, so the seat stays consumed.

**Target refund flow (idempotent, gateway-driven):**
```
User/Admin requests refund
  → insert refunds(status=REQUESTED)
  → razorpay.payments.refund(payment_id, amount)         (idempotent on refunds.uq_gateway_refund)
  → refunds.status=PROCESSING
Webhook refund.processed
  → refunds.status=PROCESSED, payments.amount_refunded += amount,
    orders.status = REFUNDED | PARTIALLY_REFUNDED,
    tickets.status=CANCELLED, restore ticket_numbers/availability
```
Add an eligibility policy (e.g. allowed until `event.start_datetime − N hours`, configurable per event).

---

## 9. Payment Reconciliation Issues

| # | Issue | Evidence |
|---|---|---|
| R1 | **`payments` row is never created in the live flow.** FE uses `/order/create-order` (inline Razorpay order, no `payments` insert). The webhook then `SELECT … FROM payments WHERE gateway_order_id=?` → **"Payment record not found"**, so even a correctly-wired webhook fails. | `order.service.js:69-84` vs `payment.webhook.js:40-52`. |
| R2 | **Two ways to create a Razorpay order** (`createOrderService` and `initiatePaymentService`) → divergent, duplicate logic; the `/payment/initiate` path is dead. | both create `createGatewayOrder`. |
| R3 | **No event log / dedupe.** Razorpay retries webhooks; without `payment_events.uq_event` you risk double-processing. | no such table. |
| R4 | **Order state split across `status` and `order_status`** makes reconciliation ambiguous. | §2. |
| R5 | **No reconciliation job** to catch "captured at gateway but not PAID locally" (the B1 orphan). | — |

**Fix:** create the `payments` row in `create-order` (status `CREATED`), promote via webhook (`payment_events`-deduped), unify on `orders.status`, and add a daily reconcile job that pulls Razorpay payments for HOLD orders and self-heals.

---

## 10. Complete Optimised Database Design (target)

```
users ─┬─< orders ──< order_items >── ticket_types >── events
       │     │  1:1                         │
       │     ├──< payments ──< refunds      └──< (event pricing cols)
       │     ├──< coupon_redemptions >── coupons
       │     └──< order_status_history
       └─< event_user_detail                payment_events (gateway log, deduped)

orders(id, user_id, event_id, status, payment_status,
       subtotal, discount_code, discount_amount, convenience_fee,
       tax_percent, tax_amount, total_price, currency,
       payment_order_id, hold_expires_at, cancel_reason, created_at)

order_items(id, order_id, ticket_type_id, quantity,
            unit_price, gst_percent, discount_amount, gst_amount, line_total, json_data)

payments(id, order_id, gateway, gateway_order_id, gateway_payment_id UNIQUE,
         amount, currency, method, amount_refunded, status, payload, captured_at, created_at)

refunds(id, order_id, payment_id, ticket_id, gateway_refund_id UNIQUE,
        amount, reason, status, requested_by, created_at, processed_at)

coupons(...) · coupon_redemptions(... uq order) · payment_events(... uq event) · order_status_history(...)
```
**Conventions:** money = `DECIMAL(12,2)` in rupees (convert to paise only at the gateway boundary, `×100` + `Math.round`); add FK constraints; one `status` column per entity.

---

## 11. Sequence Diagram (target: webhook-authoritative)

```
Customer        Frontend            Backend                     Razorpay
   │   select      │                   │                            │
   │──────────────▶│                   │                            │
   │               │ POST /order/quote │                            │
   │               │──────────────────▶│ calculatePricing (rules)   │
   │               │◀──────────────────│ breakdown (server numbers) │
   │  Pay ₹Total   │ POST /create-order│                            │
   │               │──────────────────▶│ HOLD + persist breakdown   │
   │               │                   │ payments(CREATED)          │
   │               │                   │ orders.create ────────────▶│
   │               │◀──────────────────│ {rzpOrderId, total}        │
   │   checkout    │═════════════════════════════════════════════▶ │ (charges server total)
   │               │   handler         │                            │
   │               │ POST /verify ────▶│ verify sig + amount        │
   │               │                   │ (fast-path PAID + tickets) │
   │               │                   │◀───────── webhook payment.captured ──────│
   │               │                   │ payment_events dedupe →     │
   │               │                   │ PAID + mint tickets (idem)  │
   │               │                   │ email + PDF                 │
   │   refund req  │──────────────────▶│ refunds(REQUESTED)─refund ▶│
   │               │                   │◀──── webhook refund.processed│
   │               │                   │ REFUNDED + restore stock    │
```

---

## 12. API Validation Checklist

**POST /order/quote** & **/order/create-order**
- [ ] `eventId` exists, `is_active=1`, `approval_status='APPROVED'`.
- [ ] each `ticketTypeId` belongs to `eventId`, `status=1`, within `sale_start/sale_end`.
- [ ] `quantity` integer 1..maxPerType and ≤ availability (under `FOR UPDATE`).
- [ ] per-user cap across HOLD/PAID orders for the event.
- [ ] coupon (if any): active, in window, scope matches, min_qty/min_amount met, usage/per-user limits not exceeded.
- [ ] server recomputes all money; **never** trust a client amount.

**POST /order/verify-payment**
- [ ] all `razorpay_*` + `bookingId` present; order owned by caller.
- [ ] `payment_order_id === razorpay_order_id`; signature valid.
- [ ] captured `amount === round(total_price*100)`, `status==='captured'`.
- [ ] idempotent on `orders.status==='PAID'`.

**POST /payment/webhook**
- [ ] raw body; `x-razorpay-signature` valid; **no user auth**.
- [ ] dedupe on `payment_events.uq_event`.
- [ ] handle `payment.captured`, `payment.failed`, `refund.processed`.

**Refund / cancel**
- [ ] caller owns order/ticket (or admin); within refund window; not already refunded.
- [ ] amount ≤ `payments.amount − amount_refunded`.

---

## 13. Production Readiness Report

| Area | Status | Blocker |
|---|---|---|
| Pricing correctness (display == charge == stored) | 🔴 Fail | §7 |
| GST/discount persisted & collected | 🔴 Fail | §2,§7 |
| Fulfilment reliability (no lost tickets) | 🔴 Fail | B1, R1 |
| Webhook functional (auth + raw body + dedupe) | 🔴 Fail | S2,S3,R3 |
| Secret handling (no secret in client) | 🔴 Fail | S1 |
| Refunds | 🔴 Fail | §8 |
| Reconciliation / `payments` populated | 🔴 Fail | R1 |
| Inventory: hold expiry & cancel restore | 🟠 Partial | B2,B4 |
| Amount verification on capture | 🟠 Partial | S4 |
| Scanner authorization | 🟠 Partial | S5 |
| SQL injection | ✅ Pass | parameterised |
| Order locking / oversell | ✅ Pass | `FOR UPDATE` |

**Verdict:** **Do not go live** until the 🔴 rows are fixed. Minimum set: server pricing engine (§7) + persist breakdown (§3.1/3.2) + working webhook (S2,S3) that creates `payments` (R1) and mints tickets idempotently (B1,B3) + remove client secret (S1) + refunds table & flow (§4.3,§8).

---

## 14. Suggested rollout order

1. **Stop the bleeding:** remove `VITE_RAZORPAY_KEY_SECRET` (S1, rotate key); make displayed total = charged total (either charge fee+GST or stop showing them) (§7).
2. **Schema:** run §3 ALTERs + §4 new tables.
3. **Pricing engine** + `/order/quote`; FE renders server numbers (both ends).
4. **Webhook hardening:** raw body, no auth, `payment_events` dedupe, create/promote `payments`, mint tickets idempotently.
5. **Refunds:** table + request API + Razorpay refund + webhook + inventory restore.
6. **Jobs:** hold-expiry + daily reconcile.
7. **AuthZ:** validator-only scan/cancel; amount assertion on verify.
```
