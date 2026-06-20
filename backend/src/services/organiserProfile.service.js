import pool from "../config/database.js";
import { hashPassword, verifyPassword } from "../helpers/password.helper.js";

/**
 * Organiser account self-service: update display/contact details and change the
 * login password. The organiser is a `users` row (role 3) linked 1:1 to an
 * `organizers` row; we keep both in sync.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const updateOrganiserProfileService = async ({ user, organizer }, body) => {
  const organization_name = String(body.organization_name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  if (!organization_name) throw new Error("Organisation name is required");
  if (!EMAIL_RE.test(email)) throw new Error("A valid email is required");

  // Email is the organiser's login id — keep it unique across accounts.
  const [[dup]] = await pool.query(
    `SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1`,
    [email, user.id]
  );
  if (dup) throw new Error("An account with this email already exists");

  await pool.query(`UPDATE users SET name = ?, email = ? WHERE id = ?`, [organization_name, email, user.id]);
  await pool.query(`UPDATE organizers SET organization_name = ?, contact_email = ? WHERE id = ?`, [organization_name, email, organizer.id]);

  return { organization_name, email, mobile: user.mobile };
};

export const changeOrganiserPasswordService = async (userId, { current_password, new_password }) => {
  if (!new_password || String(new_password).length < 4) {
    throw new Error("New password must be at least 4 characters");
  }
  const [[u]] = await pool.query(`SELECT password_hash FROM users WHERE id = ? LIMIT 1`, [userId]);
  if (!u) throw new Error("User not found");
  if (!u.password_hash) throw new Error("No password set on this account");

  const ok = await verifyPassword(current_password, u.password_hash);
  if (!ok) throw new Error("Current password is incorrect");

  const hash = await hashPassword(new_password);
  await pool.query(`UPDATE users SET password_hash = ? WHERE id = ?`, [hash, userId]);
  return { changed: true };
};
