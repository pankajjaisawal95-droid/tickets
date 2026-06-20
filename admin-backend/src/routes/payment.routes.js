import express from "express";
import { initiatePayment } from "../controllers/payment.controller.js";
import { paymentWebhook } from "../webhooks/payment.webhook.js";
import { accessTokenHeader } from "../constent/constent.js";
import { requireHeaders } from "../middlewares/requireHeaders.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { validate } from "../validations/validate.middleware.js";
import { paymentValidation } from "../validations/auth.validation.js";

const router = express.Router();

router.post("/initiate", requireHeaders([accessTokenHeader]), authenticate, validate(paymentValidation), initiatePayment);
// Webhook is authenticated by Razorpay SIGNATURE only — no user token.
// Raw body parser is mounted in app.js for this path.
router.post("/webhook", paymentWebhook);

export default router;
