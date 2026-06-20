import {
  listOrdersService,
  getOrderService,
  listRefundsService,
  getRefundService
} from "../services/adminOrder.service.js";
import { requestRefundService } from "../services/refund.service.js";
import { success, error } from "../helpers/response.helper.js";

/* orders */
export const listOrders = async (req, res) => {
  try {
    return success(res, await listOrdersService(req.query), "Orders fetched");
  } catch (err) { return error(res, err.message, 400); }
};

export const getOrder = async (req, res) => {
  try {
    return success(res, await getOrderService(req.params.id), "Order fetched");
  } catch (err) { return error(res, err.message, err.message === "Order not found" ? 404 : 400); }
};

/* refunds */
export const listRefunds = async (req, res) => {
  try {
    return success(res, await listRefundsService(req.query), "Refunds fetched");
  } catch (err) { return error(res, err.message, 400); }
};

export const getRefund = async (req, res) => {
  try {
    return success(res, await getRefundService(req.params.id), "Refund fetched");
  } catch (err) { return error(res, err.message, err.message === "Refund not found" ? 404 : 400); }
};

/** POST /orders/:id/refund — admin-initiated refund (reuses refund.service). */
export const refundOrder = async (req, res) => {
  try {
    const result = await requestRefundService({
      orderId: req.params.id,
      reason: req.body?.reason,
      userId: req.adminUser?.id,
      isAdmin: true
    });
    return success(res, result, "Refund initiated");
  } catch (err) {
    return error(res, err.message, 400);
  }
};
