import nodemailer from 'nodemailer';

/**
 * SMTP transporter (lazy singleton).
 *
 * Configured entirely from env so no credentials live in code:
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS
 *
 * Returns null when SMTP is not configured so callers can no-op safely
 * instead of crashing the request that triggered the email.
 */
let transporter;

export const getTransporter = () => {
  if (transporter !== undefined) return transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('✉️  SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing) — emails disabled');
    transporter = null;
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true', // true for port 465, false for 587
    auth: { user, pass }
  });

  return transporter;
};

export default getTransporter;
