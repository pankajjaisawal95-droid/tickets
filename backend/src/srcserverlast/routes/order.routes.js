import { createOrder ,verifyPayment,confirmOrder,quoteOrder,requestRefund,confirmFreeOrder} from "../controllers/order.controller.js";
import { accessTokenHeader } from "../constent/constent.js";
import { requireHeaders } from "../middlewares/requireHeaders.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { validate } from "../validations/validateArray.middleware.js";
import { orderValidation } from "../validations/auth.validation.js";
import express from "express";
import { verify } from "node:crypto";
const router = express.Router();
router.post('/quote', requireHeaders([accessTokenHeader]), authenticate, quoteOrder);
router.post('/create-order', requireHeaders([accessTokenHeader]), authenticate, validate(orderValidation), createOrder);
// router.get('/get-order/:orderId', requireHeaders([accessTokenHeader]), authenticate, getOrder);
// router.get('/all-orders/:userId', requireHeaders([accessTokenHeader]), authenticate, getAllOrders);
router.get('/confirm-order/:orderId', requireHeaders([accessTokenHeader]), authenticate, confirmOrder);
router.post('/verify-payment',requireHeaders([accessTokenHeader]), authenticate,verifyPayment)
router.post('/confirm-free', requireHeaders([accessTokenHeader]), authenticate, confirmFreeOrder);
router.post('/refund', requireHeaders([accessTokenHeader]), authenticate, requestRefund);
export default router;