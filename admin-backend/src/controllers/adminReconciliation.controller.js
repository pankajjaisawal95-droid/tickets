import {
  listPaymentsService,
  listPaymentEventsService
} from "../services/adminReconciliation.service.js";
import { success, error } from "../helpers/response.helper.js";

export const listPayments = async (req, res) => {
  try {
    return success(res, await listPaymentsService(req.query), "Payments fetched");
  } catch (err) { return error(res, err.message, 400); }
};

export const listPaymentEvents = async (req, res) => {
  try {
    return success(res, await listPaymentEventsService(req.query), "Payment events fetched");
  } catch (err) { return error(res, err.message, 400); }
};
