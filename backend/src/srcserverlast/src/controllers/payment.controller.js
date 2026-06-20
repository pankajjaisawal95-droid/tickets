import { initiatePaymentService } from "../services/payment.service.js";

export const initiatePayment = async (req, res, next) => {
  try {
    const { orderId, gateway } = req.body;
    const { paymentId, gatewayOrder } =
      await initiatePaymentService(orderId, gateway);

    return res.json({
      success: true,
      message: "Payment initiated",
      data: {
        payment_id: paymentId,
        gateway_order_id: gatewayOrder.id,
        amount: gatewayOrder.amount / 100,
        currency: gatewayOrder.currency,
        key: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (err) {
    next(err);
  }
};
