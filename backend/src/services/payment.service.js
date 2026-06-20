import  pool  from "../config/database.js";
import { createGatewayOrder } from "../gateways/razorpay.gateway.js";

export const initiatePaymentService = async (orderId, gateway) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 1️⃣ Fetch order
    const [[order]] = await conn.query(
      `
      SELECT *
      FROM orders
      WHERE id = ?
        AND status = 'HOLD'
        AND payment_status = 'PENDING'
        AND hold_expires_at > NOW()
      FOR UPDATE
      `,
      [orderId]
    );

    if (!order) {
      throw new Error("Order not eligible for payment");
    }

    // 2️⃣ Create gateway order
    let gatewayOrder;
    if (gateway === "razorpay") {
      gatewayOrder = await createGatewayOrder(order);
    } else {
      throw new Error("Unsupported payment gateway");
    }

    // 3️⃣ Insert payment record
    const [result] = await conn.query(
      `
      INSERT INTO payments
      (order_id, gateway, gateway_order_id, amount, status)
      VALUES (?, ?, ?, ?, 'PENDING')
      `,
      [
        order.id,
        gateway,
        gatewayOrder.id,
        order.total_price
      ]
    );

    await conn.commit();

    return {
      paymentId: result.insertId,
      gatewayOrder
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};
