
import * as authService from '../services/auth.service.js';
import { success, error } from '../helpers/response.helper.js';
import { sendOtpCore, verifyOtp } from '../jobs/otp.job.js';
import { generateAccessToken, generateRefreshToken, refreshTokenService, getOldRefreshTokenHash, logoutService } from '../helpers/jwt.helpers.js';
import { refreshHeader } from '../constent/constent.js';
export const otpVerify = async (req, res) => {
  try {
    const { mobile, otp, deviceId = "", deviceName = "" } = req.body;

    // const deviceId = req.get(device)
    // const deviceName = req.get(deviceName)
    const redisKey = `otp:${mobile}`;
    const verification = await verifyOtp(mobile, otp, redisKey);
    if (verification.status === false) {
      return error(res, verification.message, 400);
    }
    const refressRedisKey = `refresh:${mobile}`

    const accessToken = await generateAccessToken(mobile);

    let refreshToken = await getOldRefreshTokenHash(refressRedisKey);
    if (!refreshToken) {
      refreshToken = await generateRefreshToken(mobile, refressRedisKey);
    }

    success(
      res,
      { accessToken, refreshToken },
      'Login successful'
    );

    await authService.userUpsertBackground(mobile);
    authService.userDeviceUpsertBackground(mobile, deviceId, deviceName);

  } catch (err) {
    return error(res, err.message);
  }
};

export const sendOtp = async (req, res) => {
  try {
    const { mobile, resend = 0 } = req.body || {};
    const checkCount = await authService.count_check(mobile);
    if (!checkCount.status) {
      return error(res, checkCount.message, 400, checkCount.devices);
    }
    const redisKey = `otp:${mobile}`;
   
    const isSend = await sendOtpCore(mobile, resend, redisKey);
    if (!isSend) {
      return error(res, 'Failed to send OTP', 400);
    }
    success(res, { mobile }, 'OTP sent successfully');
  } catch (err) {
    return error(res, err.message);
  }
};




export const refreshToken = async (req, res) => {
  try {
    const refreshToken = req.headers['x-refresh-token'];
    if (!refreshToken) {
      return error(res, 'Refresh token missing', 401);
    }

    const accessToken = await refreshTokenService(refreshToken, 0);
    if (accessToken.status === false) {
      return error(res, accessToken.message, 401);
    }

    success(res, accessToken, 'Access token refreshed successfully');

  } catch (err) {
    return error(res, 'Invalid or expired refresh token', 401);
  }
};

export const sendOtpValidator = async (req, res) => {
  try {
    const { mobile, resend = 0 } = req.body;
    const userVerified = await authService.user_verified(mobile);
    if (userVerified.status === false) {
      return error(res, userVerified.message, 401);
    }
    const redisKey = `otp_validator:${mobile}`;
    const isSend = await sendOtpCore(mobile, resend, redisKey);
    if (!isSend) {
      return error(res, 'Failed to send OTP', 400);
    }
    success(res, { mobile }, 'OTP sent successfully');
  } catch (err) {
    return error(res, err.message);
  }
}

export const otpVerifyValidator = async (req, res) => {
  try {
    const { mobile, otp, deviceId = "", deviceName = "" } = req.body;
    const redisKey = `otp_validator:${mobile}`;
    const verification = await verifyOtp(mobile, otp, redisKey);
    console.log(verification)
    if (verification.status === false) {
      return error(res, verification.message, 400);
    }
    const refressRedisKey = `refresh_Validator:${mobile}`


    const accessToken = await generateAccessToken(mobile);

    let refreshToken = await getOldRefreshTokenHash(refressRedisKey);
    if (!refreshToken) {
      refreshToken = await generateRefreshToken(mobile, refressRedisKey);
    }

    success(
      res,
      { accessToken, refreshToken },
      'Login successful'
    );

    await authService.updateUserDetail(mobile, deviceId, deviceName);
  } catch (err) {
    return error(res, err.message);

  }
}

export const refreshTokenValidator = async (req, res) => {
  try {
    const refreshToken = req.headers[refreshHeader];
    console.log(refreshToken);
    if (!refreshToken) {
      return error(res, 'Refresh token missing', 401);
    }

    const accessToken = await refreshTokenService(refreshToken, 1);
    if (accessToken.status === false) {
      return error(res, accessToken.message, 401);
    }

    success(res, accessToken, 'Access token refreshed successfully');

  } catch (err) {
    return error(res, 'Invalid or expired refresh token', 401);
  }
}
export const logoutValidator = async (req, res) => {
  try {
    const refreshToken = req.headers["x-refresh-token"];
    if (!refreshToken) {
      return error(res, "Refresh token missing", 401);
    }

    const result = await logoutService(refreshToken);

    if (!result.status) {
      return error(res, result.message, 401);
    }

    return success(res, null, "Logout successful");

  } catch (err) {
    return error(res, err.message, 500);
  }
};

export const edit_profile = async (req, res, next) => {
  try {
    const { email, name } = req.body;
    if (!email && !name) {
      return error(res, 'Nothing to update', 400);
    }
    const userResult = await authService.getUserDetail(req.userId);
    if (!userResult.status) {
      return error(res, 'User not found', 404);
    }
    const userId = userResult.user.id;
    if (email) {
      const emailExists = await authService.checkEmailExists(email, userId);
      if (emailExists) {
        return error(res, 'Email already exists', 400);
      }
    }
    const updateResult = await authService.updateUserProfile(
      { email,name },
      userId
    );
    if (!updateResult.status) {
      return error(res, updateResult.message, 400);
    }
    return success(res, null, 'User updated successfully');

  } catch (err) {
    next(err);
  }
};


/**
 * GET /auth/eventUserDetail
 * Returns the logged-in user's last saved contact detail (for auto-fill).
 * Responds with null data when nothing was saved.
 */
export const getEventUserDetail = async (req, res, next) => {
  try {
    const userResult = await authService.getUserDetail(req.userId);
    if (!userResult.status) {
      return error(res, 'User not found', 404);
    }

    const detail = await authService.getSavedEventUserDetail(userResult.user.id);

    return success(res, detail || null, 'Saved detail fetched');
  } catch (err) {
    next(err);
  }
};


export const addEventUserDetail = async (req, res, next) => {
  try {
    const { name, email, mobile, event_id, sync_user_data } = req.body;

    if ( !email || !mobile || !event_id) {
      return error(res, 'Email, mobile and event_id are required', 400);
    }
    const mobileRegex = /^[0-9]{10}$/;
    if (!mobileRegex.test(mobile)) {
      return error(res, 'Mobile number must be exactly 10 digits', 400);
    }

    // 🔹 Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return error(res, 'Please enter a valid email address', 400);
    }
    const isSync = Number(sync_user_data) === 1;

    const userResult = await authService.getUserDetail(req.userId);
    if (!userResult.status) {
      return error(res, 'User not found', 404);
    }

    const userId = userResult.user.id;

    let result;

    if (isSync) {
      result = await authService.upsertEventUserDetail({
        user_id: userId,
        name,
        mobile,
        email,
        event_id,
        sync_user_data: 1
      });

      return success(res, {}, 'Event user detail synced successfully');
    } else {

      result = await authService.insertEventUserDetail({
        user_id: userId,
        name,
        mobile,
        email,
        event_id
      });

      if (!result.status) {
        return error(res, result.message, 400);
      }

      return success(res, { id: result.insertId }, 'Event user detail added successfully');
    }

  } catch (err) {
    next(err);
  }
};



