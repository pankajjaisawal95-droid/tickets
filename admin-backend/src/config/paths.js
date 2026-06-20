import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Filesystem anchors derived from the source location (NOT process.cwd()), so
 * uploads and static serving always resolve to the same folder regardless of
 * the directory the server was launched from.
 *
 * This file lives at backend/src/config/ → backend root is two levels up.
 */
const here = path.dirname(fileURLToPath(import.meta.url)); // admin-backend/src/config
export const BACKEND_ROOT = path.resolve(here, "..", "..");  // admin-backend/
// Share the SAME uploads folder as the main backend so images uploaded from the
// admin land in ../backend/assets and resolve identically across both servers.
export const ASSETS_DIR = path.resolve(BACKEND_ROOT, "..", "backend", "assets");
export const ASSETS_IMAGES_DIR = path.join(ASSETS_DIR, "images");
