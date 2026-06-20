# Admin App — AI Build Prompt (both ends)

Copy everything in the box below into your AI coding agent. It describes the **backend `/api/admin` API** and a **separate React admin SPA**, matching the existing Ticket Sanskar codebase conventions. Hand the agent access to the repo so it can follow existing patterns.

---

> # ROLE
> You are a senior full‑stack engineer extending an existing event‑ticketing platform with an **Admin Panel**. Build it in two parts: (1) backend admin APIs under `/api/admin`, (2) a new standalone **React (Vite) admin SPA** in `admin/`. Match the existing code style exactly — do not introduce new frameworks, ORMs, or state libraries beyond what's listed.
>
> # PROJECT CONTEXT (existing)
> - **Backend:** Node.js + Express 5, **raw SQL via `mysql2`** (no ORM, no migration tool), Redis (OTP), Razorpay, Nodemailer, PDFKit. Source in `backend/src`. Layering: `routes → controllers → services → repositories/gateways`. Responses use `helpers/response.helper.js` → `success(res, data, message)` / `error(res, message, code)`. All routes are mounted under `/api`; admin under `/api/admin` (`routes/admin.routes.js`, already exists).
> - **Auth:** OTP login issues a JWT **access token** sent in the **`x-access-token`** header. Middleware `middlewares/auth.middleware.js#authenticate` verifies it and sets `req.userId = <mobile>`. Resolve the full user with `services/auth.service.js#getUserDetail(mobile)` → `{ status, user: { id, name, mobile, email, role_id, ... } }`. `middlewares/requireHeaders.js#requireHeaders([accessTokenHeader])` enforces the header. Header name constant: `constent/constent.js#accessTokenHeader` (`x-access-token`).
> - **Schema is implicit** (no migrations). Tables are provisioned idempotently at startup by `services/schema.service.js` (`ensure*`). When you need a new column/table, ADD it to an `ensure*` function (check `information_schema` first; `CREATE TABLE IF NOT EXISTS` for new tables) — never write a migration tool.
> - **Existing `/api/admin` endpoints** (extend, don't break): `GET /email-history`; `GET /event/:eventId/media`; `POST /event/:eventId/gallery`; `DELETE /event/gallery/:id`; `POST /event/:eventId/artist`; `DELETE /event/artist/:id`.
>
> # DATABASE (key tables — read columns from the DB / `docs/README.md` + `docs/PAYMENT_AUDIT.md`)
> `events`(id,title,description,venue,start_datetime,end_datetime,banner_url,category_id,approval_status['APPROVED'…],is_active, gst_percent, convenience_fee_percent, convenience_fee_flat, gst_inclusive) ·
> `event_categories`(id,name) · `ticket_types`(id,event_id,name,description,price,total_quantity,status,image,sale_start,sale_end,gst_percent) ·
> `event_gallery`(id,event_id,image_url,caption,sort_order,status) · `event_artists`(id,event_id,name,image_url,role,sort_order,status) ·
> `orders`(id,user_id,event_id,status['HOLD','PAID','CANCELLED','EXPIRED','REFUNDED'],payment_status,subtotal,discount_code,discount_amount,convenience_fee,tax_percent,tax_amount,total_price,currency,payment_order_id,hold_expires_at,created_at) ·
> `order_items`(id,order_id,ticket_type_id,quantity,unit_price,gst_percent,discount_amount,gst_amount,line_total) ·
> `payments`(id,order_id,gateway,gateway_order_id,gateway_payment_id,amount,currency,method,amount_refunded,status,captured_at,created_at) ·
> `refunds`(id,order_id,payment_id,ticket_id,refund_amount,refund_type['FULL','PARTIAL'],refund_reason,gateway_refund_id,status['INITIATED','PROCESSING','COMPLETED','FAILED'],initiated_by,processed_at,created_at) ·
> `coupons`(id,code,type['PERCENT','FLAT'],value,max_discount,event_id,ticket_type_id,min_qty,min_amount,usage_limit,per_user_limit,valid_from,valid_to,status) · `coupon_redemptions`(id,coupon_id,user_id,order_id,amount) ·
> `tickets`(id,order_id,event_id,user_id,qr_hash,qr_code,status['BOOKED','USED','CANCELLED'],available_ticket,used_ticket,used_at,created_at) · `ticket_numbers`(id,ticket_id,ticket_type_id,available,used,status) · `ticket_scans`(id,ticket_id,ticket_type_id,scanned_by,scanned_at,device_info,event_id) ·
> `event_user_detail`(id,user_id,event_id,name,whatsapp_no,email,sync_user_data,status,creation_time) ·
> `home_sections`(id,type_id,title,item_limit,layout,status,sort_order) · `home_section_types`(id,code) ·
> `users`(id,mobile,email,name,status,role_id,created_at) · `ticket_validator`(id,mobile,device_id,event_id,is_verified,status) ·
> `email_history`(…) · `payment_events`(…) · `order_status_history`(…)
> Money columns are `DECIMAL` rupees.
>
> # SECURITY — ADMIN GUARD (build first)
> 1. Add an **`is_admin` concept**: extend the `ensure*` schema to add `users.role_id` usage or an `admins` table — prefer a column check. Implement `middlewares/admin.middleware.js#requireAdmin` that runs after `authenticate`, calls `getUserDetail(req.userId)`, and rejects (403) unless the user is an admin (e.g. `role_id === <ADMIN_ROLE_ID>` or present in `admins`). Make the admin role id configurable via env `ADMIN_ROLE_ID`.
> 2. Apply `[requireHeaders([accessTokenHeader]), authenticate, requireAdmin]` to **every** `/api/admin` route (including the existing ones).
> 3. Never trust client-supplied amounts/ids beyond what the schema allows; parameterize all SQL.
>
> # BACKEND DELIVERABLES (`/api/admin/*`) — one service + controller per module, wired in `routes/admin.routes.js`
> Implement list endpoints with `?limit&offset&search&status&from&to` and return `{ rows, total, limit, offset }`.
> - **Dashboard:** `GET /dashboard` → counts + revenue (orders PAID sum), tickets sold, refunds total, today/7d trends, top events.
> - **Events:** `GET /events`, `GET /events/:id`, `POST /events`, `PUT /events/:id`, `PATCH /events/:id/status` (is_active/approval_status). Include pricing rule columns (gst/fee).
> - **Ticket types:** `GET /events/:id/ticket-types`, `POST /events/:id/ticket-types`, `PUT /ticket-types/:id`, `DELETE /ticket-types/:id` (soft `status=0`).
> - **Gallery & artists:** keep existing; add `PUT` for reorder (`sort_order`) and edit.
> - **Coupons:** full CRUD `GET/POST/PUT/DELETE /coupons`, plus `GET /coupons/:id/redemptions`.
> - **Orders:** `GET /orders` (filter status/event/date), `GET /orders/:id` (with items, payment, refunds, contact, tickets, status history).
> - **Refunds:** `GET /refunds`, `POST /orders/:id/refund` (reuse `services/refund.service.js#requestRefundService`), `GET /refunds/:id`.
> - **Tickets & scans:** `GET /tickets` (filter event/status), `GET /events/:id/scans`, scan analytics (used vs available per type).
> - **Home sections:** `GET /home-sections`, `POST`, `PUT /home-sections/:id` (title,type_id,item_limit,layout,status,sort_order), `PATCH /home-sections/:id/order`, `GET /home-section-types`. (This replaces manual DB edits.)
> - **Users/validators:** `GET /users`, `GET /validators`, `POST /validators`, `PATCH /validators/:id/status`.
> - **Email history:** keep existing `GET /email-history`.
> - **Reconciliation:** `GET /payments`, `GET /payment-events` (read‑only audit).
> Follow the existing pattern exactly: thin controller (validate → call service → `success/error`), all SQL in the service, `try/catch`, no business logic in routes.
>
> # FRONTEND DELIVERABLES — new SPA in `admin/` (Vite + React 19 + react-router-dom v7)
> - **Stack:** Vite, React, react-router-dom, axios, Zustand for auth state only. Plain CSS (or your choice) — keep it clean, data‑dense, light theme. No component library required; if you use one, use a single lightweight one consistently.
> - **Auth:** reuse the OTP flow (`POST /api/auth/send-otp`, `/verify-otp`) to obtain the access token; store it; attach `x-access-token` on every request via an axios interceptor; refresh via `GET /api/auth/refresh-token` with `x-refresh-token`. Guard all routes behind login; on 403 (non‑admin) show "Not authorized".
> - **Env:** `VITE_API_BASE` (e.g. `http://localhost:5320/api`). **Never** put any secret in the client.
> - **Layout:** sidebar nav + topbar; protected `<AdminLayout>` wrapping all pages.
> - **Pages (one per backend module):** Dashboard (cards + charts), Events (table + create/edit form with banner, pricing rules, gallery & artists manager, ticket‑types editor), Coupons (table + form), Orders (table + drawer/detail with full breakdown, payment, refund button), Refunds, Tickets & Scans, Home Sections (drag‑to‑reorder, toggle status, pick type), Users/Validators, Email History, Payments/Reconciliation.
> - **UX:** reusable `<DataTable>` (server pagination/search/filter), `<StatusBadge>`, confirm modals for destructive/refund actions, toast on success/error, optimistic-safe updates, loading & empty states.
>
> # CONVENTIONS & ACCEPTANCE
> - Backend: same folder layout and naming as existing (`*.service.js`, `*.controller.js`); mount under `/api/admin`; every admin route protected by `requireAdmin`; all SQL parameterized; money in `DECIMAL` rupees, convert to paise only at the gateway.
> - Provision any new columns/tables via `services/schema.service.js` `ensure*` (idempotent), document them in `docs/README.md`.
> - Frontend: builds with `npm run build`; passes `eslint`; no console errors; works against the running backend on `:5320`.
> - Deliver: list of new/changed files, the SQL the `ensure*` adds, and a short README for running the admin app (`cd admin && npm i && npm run dev`).
> - **Build order:** (1) admin guard + auth, (2) Events + ticket types + media, (3) Home sections, (4) Coupons, (5) Orders + refunds, (6) Dashboard, (7) Tickets/scans, (8) users/validators, (9) reconciliation. After each step, verify endpoints with curl and the page renders.
>
> Start by reading `backend/docs/README.md` and `backend/docs/PAYMENT_AUDIT.md`, confirm the real column names against the database, then implement step (1).

---

## How to use this prompt
1. Paste the boxed section into your AI agent (Claude Code, Cursor, etc.) **with the repo open** so it can match existing patterns.
2. Have it implement **one build-order step at a time**, verifying each before moving on.
3. The admin SPA lives in a new `admin/` folder (separate from `frontend/`), sharing the same backend.

## Notes specific to this codebase
- There is **no admin role enforcement today** — the existing `/api/admin` routes only require a valid user token. Implementing `requireAdmin` (step 1) is essential before exposing write endpoints.
- Home-section ordering/status/type (which currently require manual SQL like `UPDATE home_sections …`) becomes a UI in the **Home Sections** page.
- Refunds must go through `services/refund.service.js#requestRefundService` so the Razorpay refund + `refunds` row + webhook reconciliation all stay consistent.
- Keep the Razorpay **secret** server-side only; the admin SPA needs no payment keys.
