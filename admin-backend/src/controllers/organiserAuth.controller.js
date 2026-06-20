import {
  organiserRegisterService,
  organiserLoginService,
  organiserSendRegisterOtpService
} from "../services/organiserAuth.service.js";
import { success, error } from "../helpers/response.helper.js";

/** POST /organiser/auth/register/send-otp  { mobile, email } — texts a verification OTP */
export const organiserSendRegisterOtp = async (req, res) => {
  try {
    const { mobile, email } = req.body || {};
    const data = await organiserSendRegisterOtpService({ mobile, email });
    return success(res, data, "OTP sent");
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/** POST /organiser/auth/register  { organization_name, email, mobile, password, otp } */
export const organiserRegister = async (req, res) => {
  try {
    const { organization_name, email, mobile, password, otp } = req.body || {};
    const data = await organiserRegisterService({ organization_name, email, mobile, password, otp });
    return success(res, data, "Registration successful", 201);
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/** POST /organiser/auth/login  { email, password } -> { accessToken, refreshToken, user } */
export const organiserLogin = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const data = await organiserLoginService({ email, password });
    return success(res, data, "Login successful");
  } catch (err) {
    const code = /not authorized/i.test(err.message) ? 403 : 401;
    return error(res, err.message, code);
  }
};
