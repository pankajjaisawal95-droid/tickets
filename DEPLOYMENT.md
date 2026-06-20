# Deployment Guide — Frontend & Admin (Vite SPA)

How to build and deploy the **frontend** and **admin** apps to production
(Apache / cPanel / LiteSpeed), and how to avoid the common SPA pitfalls.

Both apps are Vite + React single-page apps served from a **domain/subdomain root**
with `base: '/'`.

---

## 1. Build

```bash
# Frontend
cd frontend
npm run build      # outputs to frontend/dist/

# Admin
cd admin
npm run build      # outputs to admin/dist/
```

Each build produces:

```
dist/
├── index.html          ← entry point (references the hashed assets below)
├── assets/
│   ├── index-XXXXXXXX.js     ← hash changes on EVERY build
│   └── index-YYYYYYYY.css
├── .htaccess           ← SPA fallback (hidden file — see §4)
└── (other static files: vite.svg, images, etc.)
```

---

## 2. The golden rule: `index.html` + `assets/` are ONE matched pair

Vite puts a **content hash** in every asset filename (`index-BpyKSQO1.js`) for
cache-busting. **The hash changes on every build.** So `index.html` only works
with the **exact `assets/` folder from the same build**.

| | Result |
|---|---|
| ✅ New `index.html` + new `assets/` | works |
| ❌ New `index.html` + old `assets/` | **white screen / MIME error** (see §5) |
| ❌ Old `index.html` + new `assets/` | white screen / MIME error |

> **Never upload `index.html` by itself.** Always deploy `index.html` and
> `assets/` together, from the same `dist/`.

---

## 3. Deploy steps (every release)

1. Build the app (§1).
2. On the server web root, **delete** the old `index.html` **and** the entire
   old `assets/` folder. (Removing stale hashed files prevents mismatches.)
3. Upload the **contents of `dist/`** into the web root — **not** the `dist`
   folder itself. The web root must end up looking like:
   ```
   <web-root>/
   ├── index.html
   ├── assets/index-XXXXXXXX.js
   ├── assets/index-YYYYYYYY.css
   ├── .htaccess
   └── ...
   ```
4. Verify the asset loads directly in the browser:
   `https://<your-domain>/assets/index-XXXXXXXX.js`
   → must return **JavaScript**, not your HTML page.
5. **Hard-refresh** (Ctrl+Shift+R) to drop the browser's cached old `index.html`.

> Do **not** upload `dist/oldbuild/` or any nested old build folder — delete it
> first so it can't get mixed into the deployment.

---

## 4. SPA fallback (deep links & refresh)

A built SPA only has real files for `/` and `/assets/*`. Opening a route
directly (e.g. `/contact`) or refreshing would 404, because the server looks for
a file at that path before React Router runs. The fix is a rewrite that serves
`index.html` for any non-file route.

### Apache / cPanel / LiteSpeed — `.htaccess`

Already included in both `frontend/public/.htaccess` and `admin/public/.htaccess`,
so it is copied into `dist/` on every build:

```apache
# SPA fallback — serve index.html for any client-side route
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /

  # Real file or directory → serve as-is
  RewriteCond %{REQUEST_FILENAME} -f [OR]
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteRule ^ - [L]

  # Otherwise hand the route to the SPA entry point
  RewriteRule ^ index.html [L]
</IfModule>
```

Requirements on the server:
- `mod_rewrite` enabled.
- `AllowOverride All` for the directory (otherwise `.htaccess` is ignored).
- `.htaccess` is a **hidden file** — enable "show hidden files" in your FTP
  client / cPanel File Manager, or it silently won't be uploaded.

### nginx (alternative)

If the server is nginx, `.htaccess` does nothing. Use this in the `server` block:

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

---

## 5. Common error: `Failed to load module script ... MIME type "text/html"`

```
Failed to load module script: Expected a JavaScript-or-Wasm module script
but the server responded with a MIME type of "text/html".
```

**Meaning:** the browser requested `/assets/index-XXXX.js`, the server couldn't
find that file, so the SPA fallback (§4) returned `index.html` (HTML) instead.
The browser refuses to run HTML as a module → this error.

**Cause (99% of the time):** `index.html` and `assets/` are out of sync — almost
always because only `index.html` was re-uploaded while the old `assets/` stayed
on the server (violates §2).

**Fix:** redeploy per §3 — delete old `index.html` + `assets/`, upload the new
`index.html` **and** new `assets/` together, then hard-refresh.

**Quick diagnosis:** open the failing URL directly —
`https://<your-domain>/assets/index-XXXX.js`. If it shows your page (HTML) the
file isn't on the server at that path; if it shows JavaScript the deploy is fine.

---

## 6. Test the production build locally before deploying

```bash
cd frontend   # or: cd admin
npm run build
npm run preview
```

`npm run preview` serves `dist/` exactly like production (correct MIME types +
SPA fallback). Open the preview URL, navigate to a deep route (e.g. `/contact`),
and refresh — if it works here, the build is healthy and any production failure
is a deployment/upload issue, not the build.

---

## 7. Environment

API base URLs live in env files (bundled into the build at build time, so
**rebuild after changing them**):

- Frontend: `frontend/.env.local` → `VITE_BASEURL=https://<api-domain>/api`
- Admin: `admin/.env` → `VITE_API_BASE=https://<api-domain>/api`

Backend runs on `PORT` from `backend/.env` (default `5320`).

---

## Quick checklist

- [ ] `npm run build` (the app you changed)
- [ ] Changed an env file? Rebuild.
- [ ] Delete old `index.html` + `assets/` on the server
- [ ] Upload **contents of `dist/`** (index.html **+** assets/ together)
- [ ] `.htaccess` uploaded (hidden file!) — or nginx `try_files` configured
- [ ] `https://<domain>/assets/index-XXXX.js` returns JS, not HTML
- [ ] Hard-refresh (Ctrl+Shift+R)
- [ ] Deep link + refresh (e.g. `/contact`) works
