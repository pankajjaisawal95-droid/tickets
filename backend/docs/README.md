# Ticket Sanskar — Project & API Documentation

Event ticketing platform: browse events → book tickets → pay (Razorpay) → receive e‑ticket (email + PDF) → scan at the gate → cancel/refund if needed.

- **Backend:** Node.js + Express 5, MySQL (`mysql2`, raw SQL), Redis (OTP), Razorpay, Nodemailer, PDFKit.
- **Frontend:** React 19 + Vite, Zustand (cart), React Router.
- **Related docs:** [PAYMENT_AUDIT.md](./PAYMENT_AUDIT.md) — payment-module audit & schema rationale.

---

## 1. Architecture

```
frontend (Vite :5173)  ──HTTP──▶  backend (Express :5320, prefix /api)  ──▶  MySQL
                                          │                                   Redis (OTP)
                                          └─▶ Razorpay (orders/payments/refunds + webhook)
                                          └─▶ SMTP (confirmation / cancellation email + PDF)
```

**Backend layering** (`backend/src`):
```
routes/        HTTP routing + middleware wiring
controllers/   request/response, validation, calls services
services/      business logic + SQL (the core)
repositories/  low-level SQL helpers (order.repository.js)
gateways/      Razorpay client (orders, payments, refunds, signatures)
webhooks/      Razorpay webhook handler (authoritative fulfilment)
jobs/          recurring tasks (hold expiry, reconciliation)
helpers/       email, jwt, otp, sms, response, pdf
middlewares/   auth, cors, headers, error, validation
config/        db pool, redis, mailer, swagger
sql/           reference DDL (auto-applied by services/schema.service.js)
```

**Startup** ([server.js](../src/server.js)) provisions schema idempotently, then starts jobs:
```
ensureEmailHistoryTable()      → email_history
ensureEventMediaTables()       → event_gallery, event_artists
ensureAdminSchema()            → users.role_id (+ idx_role) — admin guard key
ensurePaymentSchema()          → order/payment/refund columns + coupons, payment_events, …
  └─ .then(startBackgroundJobs) → expireHolds (5m), reconcileOrders (10m)
```
No migration tool: each `ensure*` checks `information_schema` and only adds what's missing.

---

## 2. Environment

**Backend `.env`** (key values):
| Var | Purpose |
|---|---|
| `PORT` (5320), `BASE_URL` | server |
| `DB_HOST/USER/PASS/NAME/PORT` | MySQL |
| `REDIS_HOST/PORT` | OTP store |
| `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRES_IN` | tokens |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | gateway |
| `RAZORPAY_WEBHOOK_SECRET` | **required** for webhook (fails closed) |
| `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` | email |
| `PUBLIC_ASSET_URL` | absolute base for email banners/links |
| `REFUND_CUTOFF_HOURS` | block cancellation N hours before event start |
| `ADMIN_ROLE_ID` | role_id that grants `/api/admin` access (default `2`) |

**Frontend `.env.local`:** `VITE_BASEURL` (`…/api`), `VITE_RAZORPAY_KEY_ID` (**public key only** — never the secret).

---

## 3. Authentication model

- **Login is OTP-based** (mobile → SMS OTP via Redis, 5‑min TTL). Verifying issues a JWT **access token** + **refresh token**.
- Protected requests send the access token in the **`x-access-token`** header (`authenticate` middleware → `req.userId = mobile`).
- Token refresh uses the **`x-refresh-token`** header.
- `requireHeaders([...])` rejects requests missing required headers before auth runs.
- The **webhook is unauthenticated by token** — it's verified by Razorpay **signature** only.

---

## 4. API reference

All paths are prefixed with **`/api`**. Auth column: 🔓 public · 🔑 access token · ♻️ refresh token · 🔏 signature.

### Auth — `/api/auth`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/send-otp` | 🔓 | send login OTP to a mobile |
| POST | `/verify-otp` | 🔓 | verify OTP → access + refresh tokens |
| GET | `/refresh-token` | ♻️ | new access token |
| POST | `/edit-profile` | 🔑 | update name/email |
| POST | `/addEventUserDetail` | 🔑 | save booking contact (name/email/whatsapp), optional `sync_user_data=1` |
| GET | `/eventUserDetail` | 🔑 | last saved contact (checkout auto-fill) |
| POST | `/send-otp-validator`, `/verify-otp-validator`, GET `/logout-validator`, `/refresh-token-validator` | 🔓/♻️ | gate-scanner (validator) auth |

### Events — `/api/event`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/getevent?eventId=` | 🔓 | event details + **gallery[] + artists[]** |
| GET | `/ticket-types/:eventId` | 🔓 | ticket types with live **availability** (sold-out included, `available_quantity=0`) |
| POST | `/validator-event` | 🔑 | event for a validator |

### Home — `/api/home`
| GET | `/home-data` | 🔓 | homepage sections (upcoming/active/featured/…) |

### Orders & payments — `/api/order`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/quote` | 🔑 | **server-authoritative price breakdown** (subtotal, discount, fee, GST, total) — no client math |
| POST | `/create-order` | 🔑 | HOLD order, persist breakdown, create Razorpay order + `payments(CREATED)` |
| POST | `/verify-payment` | 🔑 | verify signature **+ assert captured amount**, mark PAID, mint tickets |
| POST | `/refund` | 🔑 | request refund (by `orderId` or `ticketId`) |
| GET | `/confirm-order/:orderId` | 🔑 | idempotent confirm helper |

### Payments — `/api/payment`
| POST | `/initiate` | 🔑 | (alt) create gateway order + payment row |
| POST | `/webhook` | 🔏 | **authoritative fulfilment**: `payment.captured`/`failed`/`refund.processed` |

### Tickets — `/api/ticket`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/my-ticket` | 🔑 | user's tickets (BOOKED/USED/CANCELLED) + `cancellable`, `refund_status` |
| POST | `/cancle-ticket` | 🔑 | cancel + refund + cancellation email |
| POST | `/free-ticket` | 🔑 | issue a free (₹0) ticket |
| POST | `/update-status` | 🔑 | use/cancel by `qrHash` |

### Scanning — `/api/qrscan`
| POST | `/qrscan-validator` | 🔑 | validate a QR at the gate |
| POST | `/ticket-scan` | 🔑 | mark N entries used (per ticket type) |

### Admin — `/api/admin`

**Admin login is separate from the user OTP flow** — it's password-based:

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/admin/auth/login` | 🔓 | `{ mobile, password }` → `{ accessToken, refreshToken, user }` |

`adminLoginService` verifies the password against `users.password_hash` (scrypt,
`helpers/password.helper.js`) **and** that `role_id === ADMIN_ROLE_ID`. Wrong
password → **401**; valid user but not admin → **403**. Tokens are minted exactly
like the OTP flow (subject = mobile), so `authenticate` and `/auth/refresh-token`
keep working. Provision admins with the seed script:

```bash
cd backend
npm run seed:admin -- --mobile 9818524882 --password "StrongPass123" [--name "Admin"] [--email admin@x.com]
```

**Every other** admin route is protected by `[requireHeaders([x-access-token]), authenticate, requireAdmin]`
(🛡️). `requireAdmin` (`middlewares/admin.middleware.js`) resolves the caller via
`getUserDetail(mobile)` and rejects with **403** unless `users.role_id === ADMIN_ROLE_ID`
(env, default `2`).

All **list** endpoints accept `?limit&offset&search&status&from&to` (plus per-module
filters) and return `{ rows, total, limit, offset }`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/upload` | multipart image upload (`file`, `folder`=event\|ticket\|gallery\|artist) → `{ url, path }`; stored under `assets/images/<folder>`, served at `/assets/...` (≤5 MB, images only) |
| GET | `/dashboard` | counts, revenue (PAID), tickets sold, refunds, today + 7-day trend, top events |
| GET | `/events` | list events (filters: `status`=is_active, `approval_status`, `category_id`) |
| POST | `/events` | create event (incl. pricing-rule columns) |
| GET | `/events/:id` | event + ticket_types + gallery + artists |
| PUT | `/events/:id` | update event |
| PATCH | `/events/:id/status` | set `is_active` / `approval_status` |
| GET | `/categories` | event categories (reference) |
| GET | `/organizers` | organizers (reference for the event form; `organizer_id` is a required FK) |
| GET | `/events/:id/ticket-types` | list ticket types |
| POST | `/events/:id/ticket-types` | create ticket type |
| PUT | `/ticket-types/:id` | update ticket type |
| DELETE | `/ticket-types/:id` | soft-delete (`status=0`) |
| GET | `/event/:eventId/media` | list gallery + artists |
| POST | `/event/:eventId/gallery` | add gallery image |
| PUT | `/event/gallery/:id` | edit gallery image |
| PUT | `/event/gallery/reorder` | bulk reorder gallery (`{items:[{id,sort_order}]}`) |
| DELETE | `/event/gallery/:id` | remove gallery image |
| POST | `/event/:eventId/artist` | add artist |
| PUT | `/event/artist/:id` | edit artist |
| PUT | `/event/artist/reorder` | bulk reorder artists |
| DELETE | `/event/artist/:id` | remove artist |
| GET | `/home-sections` | list homepage sections |
| POST | `/home-sections` | create section |
| PUT | `/home-sections/:id` | update section |
| PATCH | `/home-sections/:id/order` | reorder (`{items:[{id,sort_order}]}`) |
| DELETE | `/home-sections/:id` | delete section |
| GET | `/home-section-types` | section type catalog |
| GET | `/coupons` | list coupons (filters: `type`,`status`,`event_id`) |
| POST | `/coupons` | create coupon |
| GET | `/coupons/:id` | coupon detail |
| PUT | `/coupons/:id` | update coupon |
| DELETE | `/coupons/:id` | soft-delete (`status=0`) |
| GET | `/coupons/:id/redemptions` | redemption history |
| GET | `/orders` | list orders (filters: `status`,`event_id`,`from`,`to`) |
| GET | `/orders/:id` | order + items + payments + refunds + contact + tickets + status history |
| POST | `/orders/:id/refund` | admin-initiated refund (reuses `refund.service`) |
| GET | `/refunds` | list refunds |
| GET | `/refunds/:id` | refund detail |
| GET | `/tickets` | list tickets (filters: `event_id`,`status`,`ticket_type_id`) |
| GET | `/events/:id/scans` | scan log for an event |
| GET | `/events/:id/scan-analytics` | used-vs-available per ticket type + total scans |
| GET | `/users` | user directory (filters: `status`,`role_id`) |
| GET | `/validators` | gate validators |
| POST | `/validators` | create validator |
| PATCH | `/validators/:id/status` | ACTIVE / DEACTIVE |
| GET | `/email-history` | sent-email audit (filter status/type/recipient) |
| GET | `/payments` | payment ledger (read-only reconciliation) |
| GET | `/payment-events` | raw webhook event log (read-only) |

> Swagger UI is served at `/api-docs`.

---

## 5. Core workflows

### 5.1 Booking → payment → e‑ticket
```
1. Browse        GET /event/getevent, /event/ticket-types/:id   (availability live)
2. Pick contact  POST /auth/addEventUserDetail   (auto-fill via GET /auth/eventUserDetail)
3. Quote         POST /order/quote               → server breakdown rendered as-is
4. Create order  POST /order/create-order        → HOLD + payments(CREATED) + Razorpay order
5. Pay           Razorpay Checkout (order_id)    → charges the SERVER total
6. Verify        POST /order/verify-payment      → signature + amount assert → PAID → mint ticket
7. Webhook       payment.captured                → authoritative PAID + mint (idempotent)
8. Deliver       confirmation email + QR + PDF; ticket visible in /ticket/my-ticket
```
Tickets are minted by **whichever of step 6/7 arrives first** (idempotent), so a dropped browser never loses a paid ticket — `reconcileOrders` also self-heals stuck HOLDs.

### 5.2 Pricing (dynamic, optional)
`calculatePricing()` (services/pricing.service.js) is the single engine for both `/quote` and `/create-order`:
- GST% = `ticket_type.gst_percent ?? event.gst_percent ?? 0`
- convenience fee = `event.convenience_fee_flat + convenience_fee_percent`
- discount = validated `coupons` (scope/limits/window)
- **nothing configured → all zeros → plain amount.** Display = charge = stored.

### 5.3 Cancellation → refund
```
GET /ticket/my-ticket          → cancellable flag (status/used/refund-window checked in DB)
POST /ticket/cancle-ticket     → validate → Razorpay refund (INITIATED) → cancel ticket+order (free seat)
                                 → cancellation email (with refund amount/status)
webhook refund.processed       → refund COMPLETED, order REFUNDED, payments.amount_refunded
```
Cancelled tickets stay visible in the **Cancelled** tab with a refund-status chip.

### 5.4 Inventory & holds
- Availability = `total_quantity − Σ(qty of PAID + unexpired-HOLD orders)`, clamped ≥0. Cancelled/refunded/expired free their seats.
- `expireHolds` flips stale `HOLD → EXPIRED` every 5 min so inventory isn't locked by abandoned carts.
- `create-order` re-checks stock under a row lock (`FOR UPDATE`) → no oversell.

### 5.5 Gate scanning
`/qrscan/qrscan-validator` + `/ticket/ticket-scan` decrement `ticket_numbers.available`, increment `used`, log to `ticket_scans`, and flip the ticket to `USED` when fully consumed.

### 5.6 Event media
`event_gallery` + `event_artists` are attached to `GET /event/getevent`; managed via `/api/admin/event/...`.

---

## 6. Data model (key tables)

| Table | Role |
|---|---|
| `users`, `user_devices`, `ticket_validator` | identity + gate scanners |
| `events`, `event_categories`, `ticket_types` | catalog + pricing rules |
| `event_gallery`, `event_artists` | per-event media |
| `orders`, `order_items` | booking + persisted price breakdown |
| `payments`, `payment_events`, `refunds` | gateway truth + idempotency + refunds |
| `coupons`, `coupon_redemptions` | dynamic discounts |
| `tickets`, `ticket_numbers`, `ticket_scans` | issued tickets + per-type counts + scan log |
| `event_user_detail` | per-event booking contact |
| `email_history`, `order_status_history` | audit trails |

Money is `DECIMAL` rupees; convert to paise (`×100`, rounded) only at the Razorpay boundary.

---

## 7. Running locally

```bash
# backend
cd backend && npm install && node src/main.js     # serves /api on :5320, provisions schema
# frontend
cd frontend && npm install && npm run dev          # :5173
```
Configure the Razorpay **webhook** → `https://<host>/api/payment/webhook` with events
`payment.captured`, `payment.failed`, `refund.processed`, and set `RAZORPAY_WEBHOOK_SECRET`.
