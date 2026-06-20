import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { success, error } from "../helpers/response.helper.js";
import { ASSETS_IMAGES_DIR } from "../config/paths.js";

/**
 * Image upload for the admin panel (banners, cart images, ticket-type images,
 * gallery photos, artist photos). Files land in backend/assets/images/<folder>
 * and are served statically at /assets/images/<folder>/<file> (mounted in app.js).
 *
 * POST /api/admin/upload  (multipart/form-data)
 *   - field `file`   : the image
 *   - field `folder` : optional sub-folder (event | ticket | gallery | artist),
 *                      whitelisted; defaults to `event`.
 * Returns { url, path }.
 */

const ASSETS_ROOT = ASSETS_IMAGES_DIR; // backend/assets/images (cwd-independent)
const ALLOWED_FOLDERS = new Set(["event", "ticket", "gallery", "artist", "misc"]);
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".jfif", ".png", ".webp", ".gif", ".avif"]);

// Prefer the query param: it's available the moment the request arrives, BEFORE
// multer parses the multipart body. Reading req.body.folder in diskStorage's
// destination is unreliable (body fields aren't parsed yet), which would save
// the file to the default folder while the response URL used the real folder.
const folderFromReq = (req) => {
  const f = String(req.query?.folder || req.body?.folder || "event").toLowerCase();
  return ALLOWED_FOLDERS.has(f) ? f : "event";
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(ASSETS_ROOT, folderFromReq(req));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || "").toLowerCase().replace(/[^.a-z0-9]/g, "") || ".jpg";
    const safe = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, safe);
  }
});

const uploader = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || "").toLowerCase();
    if (ALLOWED_MIME.has(file.mimetype) || ALLOWED_EXT.has(ext)) return cb(null, true);
    cb(new Error("Only image files are allowed"));
  }
}).single("file");

/** Absolute, browser-reachable base for the uploaded asset. */
const assetBase = (req) =>
  (process.env.PUBLIC_ASSET_URL || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");

export const uploadImage = (req, res) => {
  uploader(req, res, (err) => {
    if (err) return error(res, err.message, 400);
    if (!req.file) return error(res, "No file uploaded (field 'file')", 400);

    const folder = folderFromReq(req);
    const relPath = `/assets/images/${folder}/${req.file.filename}`;
    const url = `${assetBase(req)}${relPath}`;
    return success(res, { url, path: relPath, filename: req.file.filename }, "Uploaded");
  });
};

/**
 * Fallback for /assets/images/<...> requests that miss the exact path. Looks up
 * the requested filename across every image subfolder and serves the first
 * match, so a stored URL pointing at the wrong subfolder (e.g. /gallery/x.png
 * when x.png actually lives in /event/) still resolves. Mounted after the
 * static handler — only reached on a miss.
 */
export const imageFallback = (req, res, next) => {
  const name = path.basename(req.path || ""); // sanitised: strips any traversal
  if (!name || name === "." || name === "/") return next();
  try {
    const entries = fs.readdirSync(ASSETS_IMAGES_DIR, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name === name) {
        return res.sendFile(path.join(ASSETS_IMAGES_DIR, name));
      }
      if (e.isDirectory()) {
        const candidate = path.join(ASSETS_IMAGES_DIR, e.name, name);
        if (fs.existsSync(candidate)) return res.sendFile(candidate);
      }
    }
  } catch { /* fall through to 404 */ }
  return next();
};
