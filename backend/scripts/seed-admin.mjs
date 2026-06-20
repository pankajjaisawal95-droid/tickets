/**
 * Create or update an admin account (mobile + password login).
 *
 * Sets users.password_hash (scrypt) and role_id = ADMIN_ROLE_ID for the given
 * mobile. Inserts the user if absent, updates in place if present.
 *
 * Usage:
 *   node scripts/seed-admin.mjs --mobile 9818524882 --password "Secret123" [--name "Admin"] [--email admin@x.com]
 *   # or via env:
 *   ADMIN_MOBILE=9818524882 ADMIN_PASSWORD=Secret123 node scripts/seed-admin.mjs
 *
 * Reads DB creds from backend/.env (same as the server).
 */
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { hashPassword } from "../src/helpers/password.helper.js";

dotenv.config({ path: new URL("../.env", import.meta.url) });

/* ----- args ----- */
const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 ? argv[i + 1] : undefined;
};

const mobile = arg("mobile") || process.env.ADMIN_MOBILE;
const password = arg("password") || process.env.ADMIN_PASSWORD;
const name = arg("name") || process.env.ADMIN_NAME || "Administrator";
const email = arg("email") || process.env.ADMIN_EMAIL || null;
const ADMIN_ROLE_ID = Number(process.env.ADMIN_ROLE_ID || 2);

if (!mobile || !password) {
  console.error("Usage: node scripts/seed-admin.mjs --mobile <10-digit> --password <password> [--name <name>] [--email <email>]");
  process.exit(1);
}
if (!/^[0-9]{6,15}$/.test(String(mobile))) {
  console.error("✖ mobile must be digits (10 expected)");
  process.exit(1);
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "sea_db",
  port: Number(process.env.DB_PORT || 3306),
  connectionLimit: 2
});

try {
  const password_hash = await hashPassword(password);
  const [[existing]] = await pool.query("SELECT id FROM users WHERE mobile = ? LIMIT 1", [String(mobile)]);

  if (existing) {
    await pool.query(
      `UPDATE users SET password_hash = ?, role_id = ?, status = 'ACTIVE',
              name = COALESCE(?, name), email = COALESCE(?, email)
       WHERE id = ?`,
      [password_hash, ADMIN_ROLE_ID, name, email, existing.id]
    );
    console.log(`✓ Updated admin (user #${existing.id}, mobile ${mobile}, role_id ${ADMIN_ROLE_ID})`);
  } else {
    const [res] = await pool.query(
      `INSERT INTO users (mobile, name, email, password_hash, role_id, status, is_verified)
       VALUES (?, ?, ?, ?, ?, 'ACTIVE', 1)`,
      [String(mobile), name, email, password_hash, ADMIN_ROLE_ID]
    );
    console.log(`✓ Created admin (user #${res.insertId}, mobile ${mobile}, role_id ${ADMIN_ROLE_ID})`);
  }
  console.log("  Log in at the admin panel with this mobile + password.");
} catch (err) {
  console.error("✖ seed-admin failed:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
