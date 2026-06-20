import { getUserDetail } from "../services/auth.service.js";
import { error } from "../helpers/response.helper.js";

/**
 * Admin guard. Runs AFTER `authenticate` (which sets req.userId = <mobile>).
 *
 * Resolves the full user, then rejects with 403 unless the user's role_id
 * matches the configured admin role. The admin role id is configurable via the
 * `ADMIN_ROLE_ID` env var (defaults to 2 — normal users are seeded with
 * role_id = 1).
 *
 * On success it attaches the resolved admin user to `req.adminUser` so
 * downstream controllers/services can read the numeric id (e.g. initiated_by).
 */
const ADMIN_ROLE_ID = Number(process.env.ADMIN_ROLE_ID || 2);

export const requireAdmin = async (req, res, next) => {
  try {
    if (!req.userId) {
      return error(res, "Not authorized", 401);
    }

    const result = await getUserDetail(req.userId);
    if (!result?.status || !result.user) {
      return error(res, "Not authorized", 403);
    }

    if (Number(result.user.role_id) !== ADMIN_ROLE_ID) {
      return error(res, "Not authorized: admin access required", 403);
    }

    req.adminUser = result.user;
    next();
  } catch (err) {
    console.error("requireAdmin error:", err.message);
    return error(res, "Not authorized", 403);
  }
};
