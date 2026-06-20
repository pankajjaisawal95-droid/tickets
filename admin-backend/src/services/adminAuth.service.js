import pool from "../config/database.js";
import { verifyPassword } from "../helpers/password.helper.js";
import { generateAccessToken, generateRefreshToken, getOldRefreshTokenHash } from "../helpers/jwt.helpers.js";

/**
 * Admin authentication — separate from the user OTP flow. Admins log in with
 * mobile + password (verified against users.password_hash) and must carry the
 * admin role (users.role_id === ADMIN_ROLE_ID).
 *
 * Tokens are minted the same way as the OTP flow (subject = mobile) so the
 * existing `authenticate` middleware and `/auth/refresh-token` keep working.
 */
const ADMIN_ROLE_ID = Number(process.env.ADMIN_ROLE_ID || 2);

export const adminLoginService = async ({ mobile, password }) => {
  if (!mobile || !password) throw new Error("Mobile and password are required");

  const [[user]] = await pool.query(
    `SELECT id, name, mobile, email, role_id, status, password_hash
     FROM users WHERE mobile = ? LIMIT 1`,
    [String(mobile).trim()]
  );

  // Uniform error to avoid leaking which part failed.
  const invalid = new Error("Invalid credentials");
  if (!user) throw invalid;
  if (Number(user.role_id) !== ADMIN_ROLE_ID) throw new Error("Not authorized: not an admin account");
  if (user.status && user.status !== "ACTIVE") throw new Error("Account is not active");
  if (!user.password_hash) throw new Error("No password set for this admin. Run the seed script.");

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) throw invalid;

  const accessToken = await generateAccessToken(user.mobile);
  const refreshRedisKey = `refresh:${user.mobile}`;
  let refreshToken = await getOldRefreshTokenHash(refreshRedisKey);
  if (!refreshToken) {
    refreshToken = await generateRefreshToken(user.mobile, refreshRedisKey);
  }

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, mobile: user.mobile, email: user.email, role_id: user.role_id }
  };
};
