# Ticket Admin Panel

Standalone React (Vite) SPA for administering the event-ticketing platform.
Talks to the existing backend at `/api/admin/*` (protected by the admin guard).

## Stack
- **Vite + React 19**
- **react-router-dom v7** — routing
- **axios** — HTTP, with `x-access-token` interceptor + one-shot refresh
- **zustand** — auth state only
- Plain CSS (`src/index.css`) — clean, data-dense, light theme

## Prerequisites
- The backend running on `:5320` with the admin endpoints (see `backend/docs/README.md`).
- **An admin account** (mobile + password). Create/update one with the backend seed script:
  ```bash
  cd backend
  npm run seed:admin -- --mobile 9818524882 --password "StrongPass123" --name "Admin" --email admin@x.com
  ```
  This sets `users.password_hash` (scrypt) and `role_id = ADMIN_ROLE_ID` (default `2`).
  Set `ADMIN_ROLE_ID` in the backend `.env` to use a different id.

## Setup
```bash
cd admin
npm install
npm run dev      # http://localhost:5174
```

Configure the API base in `.env` (copy from `.env.example`):
```
VITE_API_BASE=http://localhost:5320/api
```
> Never put secrets in the client. Only the public API base belongs here.

## Auth flow
Admin login is **separate from the user OTP flow** — it's password-based:
- `POST /api/admin/auth/login { mobile, password }` → `{ accessToken, refreshToken, user }`

The backend verifies the password against `users.password_hash` and that the
account carries the admin role (`role_id === ADMIN_ROLE_ID`). Wrong password →
`401`; valid user but not an admin → `403`.

Tokens are stored in `localStorage`; `x-access-token` is attached to every request.
On `401` the client refreshes via `GET /api/auth/refresh-token` (`x-refresh-token`)
and replays the request; on failure it logs out.

## Scripts
| Command | Description |
|---|---|
| `npm run dev` | dev server (HMR) on :5174 |
| `npm run build` | production build → `dist/` |
| `npm run preview` | serve the production build |
| `npm run lint` | eslint |

## Pages
Dashboard · Events (create/edit with banner, pricing rules, ticket-types, gallery
& artists managers) · Coupons · Orders (detail drawer + refund) · Refunds ·
Tickets & Scans · Home Sections (drag-to-reorder) · Users & Validators ·
Email History · Payments / Reconciliation.

## Structure
```
src/
  api/client.js        axios instance, interceptors, verb helpers (unwraps {data})
  store/auth.js        zustand auth store (tokens, login/logout)
  components/          AdminLayout, DataTable, StatusBadge, Modal, Toast
  lib/                 format.js (inr/date), useFetch.js
  pages/               one file per module
```
The reusable `<DataTable>` drives server pagination/search/filter for every list
(`{ limit, offset, search, ...filters } → { rows, total, limit, offset }`).
