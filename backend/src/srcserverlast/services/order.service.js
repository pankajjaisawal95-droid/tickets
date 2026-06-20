import pool from "../config/database.js";
import {
  createOrderRepo,
  insertOrderItemRepo,
  insertOrderSeatsRepo,
  updateOrderPricingRepo
} from "./order.repository.js";
import { createGatewayOrder, fetchGatewayPayment } from "../gateways/razorpay.gateway.js";
import { calculatePricing } from "./pricing.service.js";
import {
  saveOrderAddress,
  updateOrderAddressStatus
} from "./orderAddress.service.js";
import * as crypto from "crypto";


export const createOrderService = async (
  userId,
  eventId,
  tickets,
  couponCode = null,
  location = null
) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 1️⃣ Create base order (HOLD)
    const orderId = await createOrderRepo(conn, { userId, eventId });

    // 2️⃣ Server-authoritative pricing (locks ticket types + enforces stock)
    const pricing = await calculatePricing({
      eventId,
      items: tickets,
      couponCode,
      userId,
      lock: true,
      conn
    });

    // 3️⃣ Persist priced lines (+ the specific seats for SEATED lines)
    for (const line of pricing.lines) {
      const orderItemId = await insertOrderItemRepo(conn, orderId, line);
      await insertOrderSeatsRepo(conn, orderId, orderItemId, line);
    }

    // 4️⃣ Persist the full breakdown onto the order
    await updateOrderPricingRepo(conn, orderId, pricing);

    // 5️⃣ Payment gateway — skipped entirely for free (zero-total) bookings.
    //    A free order still gets a payment row + synthetic reference so the
    //    reconciliation trail stays uniform with paid orders.
    const isFree = Number(pricing.total) <= 0;
    let gatewayOrderId;

    if (isFree) {
      gatewayOrderId = `FREE-${orderId}`;

      // 6️⃣ Save the synthetic reference on the order
      await conn.query(
        `UPDATE orders SET payment_order_id = ? WHERE id = ?`,
        [gatewayOrderId, orderId]
      );

      // 7️⃣ Payment record (gateway='free', no money to collect)
      await conn.query(
        `INSERT INTO payments (order_id, gateway, gateway_order_id, amount, currency, status)
         VALUES (?, 'free', ?, ?, ?, 'CREATED')`,
        [orderId, gatewayOrderId, pricing.total, pricing.currency]
      );
    } else {
      // Create Razorpay order from the FINAL total (incl. fee + GST)
      const rzpOrder = await createGatewayOrder({
        id: orderId,
        total_price: pricing.total,
        user_id: userId
      });
      gatewayOrderId = rzpOrder.id;

      // 6️⃣ Save gateway order id on the order
      await conn.query(
        `UPDATE orders SET payment_order_id = ? WHERE id = ?`,
        [gatewayOrderId, orderId]
      );

      // 7️⃣ Create the payment record up-front (reconciliation source of truth)
      await conn.query(
        `INSERT INTO payments (order_id, gateway, gateway_order_id, amount, currency, status)
         VALUES (?, 'razorpay', ?, ?, ?, 'CREATED')`,
        [orderId, gatewayOrderId, pricing.total, pricing.currency]
      );
    }

    await conn.commit();

    // Store the visitor's address against the order (status = CREATED).
    // Background-safe: never blocks or breaks order creation.
    if (location) {
      await saveOrderAddress({ orderId, userId, location });
    }

    return {
      orderId: gatewayOrderId,
      amount: pricing.total,
      free: isFree,
      breakdown: pricing,
      status: "HOLD",
      bookingId: orderId,
      expires_in_minutes: 5
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};


/* ---------------- CONFIRM ORDER ---------------- */
export const confirmOrderService = async (orderId, paymentId) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[order]] = await conn.query(
      `SELECT status FROM orders WHERE id = ? FOR UPDATE`,
      [orderId]
    );

    if (!order) throw new Error("Order not found");

    if (order.status === "PAID") {
      // idempotent
      return { orderId, status: "PAID" };
    }

    if (order.status !== "HOLD") {
      throw new Error("Order cannot be confirmed");
    }

    await conn.query(
      `
      UPDATE orders
      SET status = 'PAID',
          payment_status = 'PAID',
          payment_order_id = ?
      WHERE id = ?
      `,
      [paymentId, orderId]
    );

    await conn.commit();

    // Mark the stored address CONFIRMED (background-safe).
    await updateOrderAddressStatus(orderId, "CONFIRMED");

    return { orderId, status: "PAID" };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/* ---------------- CONFIRM FREE ORDER (no payment) ---------------- */
/**
 * Finalizes a zero-total order without touching any payment gateway.
 *
 * Security: the gate is the order's SERVER-STORED total_price, not anything the
 * client sends. create-order computes the price server-side, so a client can
 * never flip a paid order into a free one — if total_price > 0 we refuse and
 * the order must go through normal payment + verification instead.
 */
export const confirmFreeOrderService = async (bookingId, userId) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[order]] = await conn.query(
      `SELECT id, user_id, status, total_price, discount_code
       FROM orders WHERE id = ? FOR UPDATE`,
      [bookingId]
    );

    if (!order) throw new Error("Order not found");
    if (Number(order.user_id) !== Number(userId)) throw new Error("Not your order");

    if (order.status === "PAID") {
      await conn.commit();
      return { bookingId, status: "PAID", free: true }; // idempotent
    }

    if (order.status !== "HOLD") throw new Error("Order cannot be confirmed");

    // 🔒 Only genuinely free orders may skip payment.
    if (Number(order.total_price) > 0) {
      throw new Error("Order requires payment");
    }

    /* Mark PAID (free) */
    await conn.query(
      `UPDATE orders SET status = 'PAID', payment_status = 'PAID' WHERE id = ?`,
      [bookingId]
    );

    /* Promote the free payment record */
    await conn.query(
      `UPDATE payments SET status = 'SUCCESS', captured_at = NOW() WHERE order_id = ?`,
      [bookingId]
    );

    /* Record coupon redemption (e.g. a 100%-off coupon made it free) */
    if (order.discount_code) {
      await conn.query(
        `INSERT IGNORE INTO coupon_redemptions (coupon_id, user_id, order_id, amount)
         SELECT c.id, ?, ?, o.discount_amount
         FROM coupons c JOIN orders o ON o.id = ?
         WHERE c.code = ?`,
        [order.user_id, bookingId, bookingId, order.discount_code]
      );
    }

    /* Audit trail */
    await conn.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, note)
       VALUES (?, 'HOLD', 'PAID', 'free-confirm')`,
      [bookingId]
    );

    await conn.commit();

    // Mark the stored address CONFIRMED (background-safe).
    await updateOrderAddressStatus(bookingId, "CONFIRMED");

    return { bookingId, status: "PAID", free: true };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/* ---------------- CANCEL ORDER ---------------- */
export const cancelOrderService = async (
  orderId,
  userId,
  reason = null
) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[order]] = await conn.query(
      `
      SELECT status
      FROM orders
      WHERE id = ? AND user_id = ?
      FOR UPDATE
      `,
      [orderId, userId]
    );

    if (!order) throw new Error("Order not found");

    if (order.status === "CANCELLED") {
      return { orderId, status: "CANCELLED" };
    }

    if (order.status === "PAID") {
      throw new Error("Paid order cannot be cancelled");
    }

    await conn.query(
      `
      UPDATE orders
      SET status = 'CANCELLED',
          payment_status = 'FAILED',
          cancel_reason = ?
      WHERE id = ?
      `,
      [reason, orderId]
    );

    // 🔓 Seats auto-release because availability query
    // ignores CANCELLED orders

    await conn.commit();

    // Mark the stored address FAILED (background-safe).
    await updateOrderAddressStatus(orderId, "FAILED");

    return { orderId, status: "CANCELLED" };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

export const verifyPaymentService = async ({
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
  bookingId
}) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    /* 1️⃣ Fetch + lock order */
    const [[order]] = await conn.query(
      `SELECT id, user_id, payment_order_id, status, total_price, discount_code
       FROM orders WHERE id = ? FOR UPDATE`,
      [bookingId]
    );

    if (!order) throw new Error("Order not found");

    if (order.status === "PAID") {
      await conn.commit();
      return { bookingId, status: "PAID" }; // idempotent
    }

    if (order.payment_order_id !== razorpay_order_id) {
      throw new Error("Razorpay order mismatch");
    }

    /* 2️⃣ Verify signature (binds order ↔ payment) */
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      throw new Error("Invalid payment signature");
    }

    /* 3️⃣ Assert captured amount + status against our stored total (S4) */
    let method = null;
    try {
      const gp = await fetchGatewayPayment(razorpay_payment_id);
      method = gp?.method || null;
      if (gp?.status !== "captured" && gp?.status !== "authorized") {
        throw new Error(`Payment not captured (status: ${gp?.status})`);
      }
      const expectedPaise = Math.round(Number(order.total_price) * 100);
      if (Number(gp?.amount) !== expectedPaise) {
        throw new Error("Paid amount does not match order total");
      }
    } catch (gwErr) {
      // If the gateway lookup itself failed (network), surface it; a real
      // amount/status mismatch above is a hard stop.
      throw new Error(gwErr.message || "Could not verify payment with gateway");
    }

    /* 4️⃣ Mark order PAID (keep payment_order_id = gateway ORDER id) */
    await conn.query(
      `UPDATE orders SET status = 'PAID', payment_status = 'PAID' WHERE id = ?`,
      [bookingId]
    );

    /* 5️⃣ Promote the payment record */
    await conn.query(
      `UPDATE payments
       SET gateway_payment_id = ?, status = 'SUCCESS', method = ?, captured_at = NOW()
       WHERE gateway_order_id = ?`,
      [razorpay_payment_id, method, razorpay_order_id]
    );

    /* 6️⃣ Record coupon redemption (idempotent via uq_order) */
    if (order.discount_code) {
      await conn.query(
        `INSERT IGNORE INTO coupon_redemptions (coupon_id, user_id, order_id, amount)
         SELECT c.id, ?, ?, o.discount_amount
         FROM coupons c JOIN orders o ON o.id = ?
         WHERE c.code = ?`,
        [order.user_id, bookingId, bookingId, order.discount_code]
      );
    }

    /* 7️⃣ Audit trail */
    await conn.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, note)
       VALUES (?, 'HOLD', 'PAID', 'verify-payment')`,
      [bookingId]
    );

    await conn.commit();

    // Mark the stored address CONFIRMED (background-safe).
    await updateOrderAddressStatus(bookingId, "CONFIRMED");

    return { bookingId, status: "PAID", paymentId: razorpay_payment_id };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};
export const getOrderByIdService = async (orderId) => {
  const [rows] = await pool.query(
    `
    SELECT 
      o.id,
      o.user_id,
      o.event_id,
      o.status,
      o.payment_status,
      o.payment_order_id,
      o.total_price,
      o.created_at
    FROM orders o
    WHERE o.id = ?
    `,
    [orderId]
  );

  return rows.length ? rows[0] : null;
};