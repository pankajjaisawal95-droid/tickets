import { verifyAccessToken } from "../helpers/jwt.helpers.js";

/**
 * Optional authentication.
 *
 * Unlike `authenticate`, this NEVER rejects the request. If a valid
 * x-access-token is present it attaches req.userId; if it's missing or invalid
 * it simply continues with req.userId = null.
 *
 * Use it on public endpoints that should still capture WHO the user is when
 * they happen to be logged in (e.g. visit tracking — store the row for both
 * signed-in and anonymous visitors).
 */
export const optionalAuthenticate = async (req, res, next) => {
  const token = req.headers["x-access-token"];

  if (!token) {
    req.userId = null;
    return next();
  }

  try {
    const decoded = await verifyAccessToken(token);
    req.userId = decoded.userId;
  } catch (err) {
    // Invalid/expired token on a public route — treat as anonymous, don't block.
    req.userId = null;
  }

  next();
};
