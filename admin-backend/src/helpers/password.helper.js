import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashing for admin accounts — uses Node's built-in scrypt (no extra
 * dependency). Stored format:  scrypt$<saltHex>$<hashHex>  (fits VARCHAR(255)).
 */

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;

export const hashPassword = async (plain) => {
  if (!plain || String(plain).length < 4) {
    throw new Error("Password must be at least 4 characters");
  }
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(String(plain), salt, KEYLEN);
  return `scrypt$${salt}$${derived.toString("hex")}`;
};

export const verifyPassword = async (plain, stored) => {
  if (!stored || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hashHex] = parts;
  try {
    const derived = await scryptAsync(String(plain), salt, KEYLEN);
    const a = Buffer.from(hashHex, "hex");
    if (a.length !== derived.length) return false;
    return timingSafeEqual(a, derived);
  } catch {
    return false;
  }
};
