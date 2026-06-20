import {
  createOrderService,
  confirmOrderService,
  cancelOrderService,verifyPaymentService,
  confirmFreeOrderService

} from "../services/order.service.js";

import { success, error } from "../helpers/response.helper.js";
import { getUserDetail } from "../services/auth.service.js";
import {createTicketService} from "../services/ticket.service.js"
import { calculatePricing } from "../services/pricing.service.js";
import { requestRefundService } from "../services/refund.service.js";

/* ---------------- REQUEST REFUND ---------------- */
export const requestRefund = async (req, res, next) => {
  try {
    const { orderId, ticketId, reason } = req.body;
    if (!orderId && !ticketId) {
      return error(res, "orderId or ticketId required", 400);
    }

    const user = await getUserDetail(req.userId);
    if (!user?.status) return error(res, "User not found", 404);

    const result = await requestRefundService({
      orderId: orderId || null,
      ticketId: ticketId || null,
      userId: user.user.id,
      reason
    });

    return success(res, result, "Refund requested");
  } catch (err) {
    return error(res, err.message || "Refund failed", 400);
  }
};

/* ---------------- QUOTE (server-authoritative pricing) ---------------- */
/**
 * Returns the exact price breakdown the client must render — no client math.
 * Same engine create-order uses, so quote == charge == stored.
 */
export const quoteOrder = async (req, res, next) => {
  try {
    const { eventId, tickets, couponCode } = req.body;

    if (!eventId || !Array.isArray(tickets) || tickets.length === 0) {
      return error(res, "Invalid request payload", 400);
    }

    const user = await getUserDetail(req.userId);
    if (!user?.status) return error(res, "User not found", 404);

    const pricing = await calculatePricing({
      eventId,
      items: tickets,
      couponCode: couponCode || null,
      userId: user.user.id,
      lock: false
    });

    return success(res, pricing, "Quote calculated");
  } catch (err) {
    return error(res, err.message || "Could not calculate quote", 400);
  }
};
/* ---------------- CREATE ORDER ---------------- */
export const createOrder = async (req, res, next) => {
  try {
    const { eventId, tickets, couponCode, location } = req.body;

    if (!eventId || !Array.isArray(tickets) || tickets.length === 0) {
      return error(res, "Invalid request payload", 400);
    }

    for (const t of tickets) {
      // A line is valid if it's GA with a positive quantity, OR seated with at
      // least one seat. The pricing engine re-validates both authoritatively.
      const hasSeats = Array.isArray(t.seatIds) && t.seatIds.length > 0;
      const hasQty = t.quantity && t.quantity > 0;
      if (!t.ticketTypeId || (!hasQty && !hasSeats)) {
        return error(res, "Invalid ticket data", 400);
      }
    }

    const mobile = req.userId;
    const user = await getUserDetail(mobile);

    if (!user?.status) {
      return error(res, "User not found", 404);
    }

    const result = await createOrderService(
      user.user.id,
      eventId,
      tickets,
      couponCode || null,
      location || null
    );

    return success(res, result, "Order created successfully");
  } catch (err) {
    console.error("createOrder failed:", err.message);
    res.status(err.statusCode || 400).json({
      success: false,
      message: err.message || "Could not create order"
    });
  }
};

/* ---------------- CONFIRM ORDER ---------------- */
/**
 * Called ONLY after payment verification
 */
export const verifyPayment = async (req, res, next) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      bookingId
    } = req.body;

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !bookingId
    ) {
      return error(res, "Invalid payment payload", 400);
    }

    const result = await verifyPaymentService({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      bookingId
    });
    await createTicketService(bookingId);
    return success(res, result, "Payment verified successfully");
  } catch (err) {
    next(err);
  }
};
/* ---------------- CONFIRM FREE ORDER (skip payment) ---------------- */
/**
 * Finalizes a zero-total booking with no payment gateway, then issues the
 * ticket — the free-ticket twin of verify-payment. Refuses any order whose
 * server-stored total is > 0 (enforced in the service).
 */
export const confirmFreeOrder = async (req, res, next) => {
  try {
    const { bookingId } = req.body;
    if (!bookingId) return error(res, "bookingId required", 400);

    const user = await getUserDetail(req.userId);
    if (!user?.status) return error(res, "User not found", 404);

    const result = await confirmFreeOrderService(bookingId, user.user.id);
    await createTicketService(bookingId);

    return success(res, result, "Free booking confirmed");
  } catch (err) {
    return error(res, err.message || "Could not confirm free booking", 400);
  }
};

export const confirmOrder = async (req, res, next) => {
  try {
    const { orderId, paymentId } = req.body;

    if (!orderId || !paymentId) {
      return error(res, "Invalid request", 400);
    }

    const result = await confirmOrderService(orderId, paymentId);

    return success(res, result, "Order confirmed successfully");
  } catch (err) {
    next(err);
  }
};

/* ---------------- CANCEL ORDER ---------------- */
export const cancelOrder = async (req, res, next) => {
  try {
    const { orderId, reason } = req.body;

    if (!orderId) {
      return error(res, "Order ID required", 400);
    }

    const mobile = req.userId;
    const user = await getUserDetail(mobile);

    if (!user?.status) {
      return error(res, "User not found", 404);
    }

    const result = await cancelOrderService(
      orderId,
      user.user.id,
      reason
    );

    return success(res, result, "Order cancelled successfully");
  } catch (err) {
    next(err);
  }
};
