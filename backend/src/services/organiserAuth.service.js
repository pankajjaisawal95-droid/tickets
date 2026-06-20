import pool from "../config/database.js";
import { hashPassword, verifyPassword } from "../helpers/password.helper.js";
import { generateAccessToken, generateRefreshToken, getOldRefreshTokenHash } from "../helpers/jwt.helpers.js";
import { sendOtpCore, verifyOtp } from "../jobs/otp.job.js";

/* Registration OTP lives under its own Redis namespace so it never collides
   with the customer login OTP (`otp:<mobile>`). */
const regOtpKey = (mobile) => `otp:organiser:${mobile}`;

/**
 * Organiser authentication — email + password (mirrors the admin password flow,
 * separate from the customer OTP flow). An organiser is a `users` row with
 * role_id = ORGANISER_ROLE_ID and a password_hash, linked to an `organizers`
 * row that holds the org profile + KYC status.
 *
 * Tokens are minted the same way as every other flow (subject = mobile) so the
 * existing `authenticate` middleware and `/auth/refresh-token` keep working.
 */
const ORGANISER_ROLE_ID = Number(process.env.ORGANISER_ROLE_ID || 3);

const issueTokens = async (mobile) => {
  const accessToken = await generateAccessToken(mobile);
  const refreshRedisKey = `refresh:${mobile}`;
  let refreshToken = await getOldRefreshTokenHash(refreshRedisKey);
  if (!refreshToken) {
    refreshToken = await generateRefreshToken(mobile, refreshRedisKey);
  }
  return { accessToken, refreshToken };
};

const MOBILE_RE = /^[0-9]{10}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Ensures the mobile and email aren't already taken by any account. */
const assertUnique = async (mobile, email) => {
  const [[byMobile]] = await pool.query(`SELECT id FROM users WHERE mobile = ? LIMIT 1`, [mobile]);
  if (byMobile) throw new Error("An account with this mobile already exists");
  const [[byEmail]] = await pool.query(`SELECT id FROM users WHERE email = ? LIMIT 1`, [email]);
  if (byEmail) throw new Error("An account with this email already exists");
};

/**
 * Step 1 of registration: validate the identity fields and text an OTP to the
 * mobile. We pre-check uniqueness here so we never send an OTP to a number that
 * already has an account. No DB rows are created yet.
 */
export const organiserSendRegisterOtpService = async ({ mobile, email }) => {
  mobile = String(mobile || "").trim();
  email = String(email || "").trim().toLowerCase();
  if (!MOBILE_RE.test(mobile)) throw new Error("A valid 10-digit mobile is required");
  if (!EMAIL_RE.test(email)) throw new Error("A valid email is required");

  await assertUnique(mobile, email);
  await sendOtpCore(mobile, 0, regOtpKey(mobile)); // resend=0 → always a fresh OTP
  return { mobile };
};

export const organiserRegisterService = async ({ organization_name, email, mobile, password, otp }) => {
  organization_name = String(organization_name || "").trim();
  email = String(email || "").trim().toLowerCase();
  mobile = String(mobile || "").trim();

  if (!organization_name) throw new Error("Organization name is required");
  if (!EMAIL_RE.test(email)) throw new Error("A valid email is required");
  if (!MOBILE_RE.test(mobile)) throw new Error("A valid 10-digit mobile is required");
  if (!password || String(password).length < 4) throw new Error("Password must be at least 4 characters");
  if (!otp) throw new Error("OTP is required — verify your mobile first");

  // Verify the mobile OTP (step 2). Reuses the customer OTP machinery under the
  // organiser namespace; on success the OTP is consumed.
  const v = await verifyOtp(mobile, otp, regOtpKey(mobile));
  if (!v.status) throw new Error(v.message || "Invalid OTP");

  await assertUnique(mobile, email);

  const password_hash = await hashPassword(password);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [userRes] = await conn.query(
      `INSERT INTO users (name, mobile, email, status, role_id, password_hash)
       VALUES (?, ?, ?, 'ACTIVE', ?, ?)`,
      [organization_name, mobile, email, ORGANISER_ROLE_ID, password_hash]
    );
    const userId = userRes.insertId;

    await conn.query(
      `INSERT INTO organizers (user_id, organization_name, contact_email, kyc_status, status)
       VALUES (?, ?, ?, 'PENDING', 1)`,
      [userId, organization_name, email]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (err.code === "ER_DUP_ENTRY") throw new Error("An account with this mobile or email already exists");
    throw err;
  } finally {
    conn.release();
  }

  const tokens = await issueTokens(mobile);
  return {
    ...tokens,
    user: { name: organization_name, mobile, email, role_id: ORGANISER_ROLE_ID, kyc_status: "PENDING" }
  };
};

export const organiserLoginService = async ({ email, password }) => {
  email = String(email || "").trim().toLowerCase();
  if (!email || !password) throw new Error("Email and password are required");

  const [[user]] = await pool.query(
    `SELECT id, name, mobile, email, role_id, status, password_hash
     FROM users WHERE email = ? LIMIT 1`,
    [email]
  );

  const invalid = new Error("Invalid credentials");
  if (!user) throw invalid;
  if (Number(user.role_id) !== ORGANISER_ROLE_ID) throw new Error("Not authorized: not an organiser account");
  if (user.status && user.status !== "ACTIVE") throw new Error("Account is not active");
  if (!user.password_hash) throw invalid;

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) throw invalid;

  const [[organizer]] = await pool.query(
    `SELECT organization_name, kyc_status FROM organizers WHERE user_id = ? LIMIT 1`,
    [user.id]
  );

  const tokens = await issueTokens(user.mobile);
  return {
    ...tokens,
    user: {
      name: user.name,
      mobile: user.mobile,
      email: user.email,
      role_id: user.role_id,
      organization_name: organizer?.organization_name || user.name,
      kyc_status: organizer?.kyc_status || "PENDING"
    }
  };
};
