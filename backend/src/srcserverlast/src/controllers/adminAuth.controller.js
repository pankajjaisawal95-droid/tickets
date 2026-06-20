import { adminLoginService } from "../services/adminAuth.service.js";
import { success, error } from "../helpers/response.helper.js";

/** POST /admin/auth/login  { mobile, password } -> { accessToken, refreshToken, user } */
export const adminLogin = async (req, res) => {
  try {
    const { mobile, password } = req.body || {};
    const data = await adminLoginService({ mobile, password });
    return success(res, data, "Login successful");
  } catch (err) {
    const code = /not authorized/i.test(err.message) ? 403 : 401;
    return error(res, err.message, code);
  }
};
