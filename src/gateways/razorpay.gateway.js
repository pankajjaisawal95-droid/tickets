import Razorpay from "razorpay";
import crypto from "crypto";

/* ---------------- RAZORPAY CLIENT ---------------- */
export const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID ,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

/* ---------------- CREATE RAZORPAY ORDER ---------------- */
export const createGatewayOrder = async (order) => {
  if (!order?.total_price || !order?.id) {
    throw new Error("Invalid order data for Razorpay");
  }

  return await razorpay.orders.create({
    amount: Math.round(order.total_price * 100), // paise
    currency: "INR",
    receipt: order.id.toString(), // ✅ short & safe
    notes: {
      order_id: order.id,
      user_id: order.user_id
    }
  });
};

/* ---------------- FETCH PAYMENT (amount/status assertion) ---------------- */
export const fetchGatewayPayment = async (paymentId) => {
  return await razorpay.payments.fetch(paymentId);
};

/* ---------------- LIST PAYMENTS FOR AN ORDER (reconciliation) ---------------- */
export const fetchGatewayOrderPayments = async (gatewayOrderId) => {
  const res = await razorpay.orders.fetchPayments(gatewayOrderId);
  return res?.items || [];
};

/* ---------------- CREATE REFUND ---------------- */
/**
 * @param {string} paymentId  Razorpay payment id
 * @param {number} amountRupees  amount to refund in rupees (converted to paise)
 * @param {Object} [notes]
 */
export const createGatewayRefund = async (paymentId, amountRupees, notes = {}) => {
  return await razorpay.payments.refund(paymentId, {
    amount: Math.round(Number(amountRupees) * 100),
    speed: "normal",
    notes
  });
};

/* ---------------- VERIFY PAYMENT SIGNATURE ---------------- */
/**
 * Used after frontend payment success
 */
export const verifyPaymentSignature = ({
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature
}) => {
  const body = `${razorpay_order_id}|${razorpay_payment_id}`;

  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  return expected === razorpay_signature;
};

/* ---------------- VERIFY WEBHOOK SIGNATURE ---------------- */
/**
 * Used ONLY for Razorpay webhooks
 */
export const verifyWebhookSignature = (
  rawBody,
  razorpaySignature
) => {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  return expected === razorpaySignature;
};
