

import { Router } from 'express';
// import { otpVerify, sendOtp, refreshToken, sendOtpValidator, otpVerifyValidator, logoutValidator } from '../controllers/auth.controller.js';
import * as auth from '../controllers/auth.controller.js';
// import { qrCodeVerify } from '../controllers/qrcode.controller.js';
import { validate } from "../validations/validate.middleware.js";
import { loginValidation, otpValidation, qrCodeValidation } from "../validations/auth.validation.js"
import { requireHeaders } from "../middlewares/requireHeaders.js"
import { refreshHeader ,accessTokenHeader} from '../constent/constent.js';
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

router.post('/verify-otp', validate(loginValidation), auth.otpVerify);
router.post('/send-otp', validate(otpValidation), auth.sendOtp);
router.get('/refresh-token', requireHeaders([refreshHeader]), auth.refreshToken);
router.post('/send-otp-validator', validate(otpValidation), auth.sendOtpValidator);
router.post('/verify-otp-validator', validate(loginValidation), auth.otpVerifyValidator);
router.get('/logout-validator', requireHeaders([refreshHeader]), auth.logoutValidator);
router.get('/profile', requireHeaders([accessTokenHeader]), authenticate, auth.getProfile);
router.post('/edit-profile',  requireHeaders([accessTokenHeader]), authenticate,  auth.edit_profile);
router.get('/refresh-token-validator', requireHeaders([refreshHeader]), auth.refreshTokenValidator);
router.post('/addEventUserDetail', requireHeaders([accessTokenHeader]), authenticate, auth.addEventUserDetail);
router.get('/eventUserDetail', requireHeaders([accessTokenHeader]), authenticate, auth.getEventUserDetail);
// #swagger.security = [{ "refreshTokenAuth": [] }]




export default router;
