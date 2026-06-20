

import { getMyTicketsService  ,cancelTicketWithRefundService,updateTicketStatusService,freeTicketService } from '../services/ticket.service.js' ;
 import { success, error   } from '../helpers/response.helper.js' ;
import { getUserDetail } from "../services/auth.service.js";
import {formatMyTickets} from '../utils/qrFormatter.js';

export const getMyTickets = async (req, res, next) => {
  try {
    const mobile = req.userId;

    const user = await getUserDetail(mobile);

    if (!user || !user.status) {
      return error(res, "User not found", 404);
    }

    const tickets = await getMyTicketsService(user.user.id); // ✅ FIX

const ticketsData = formatMyTickets(tickets);
    return success(res, ticketsData, "My tickets fetched");
  } catch (err) {
    next(err);
  }
};

export const cancelTicket = async (req, res, next) => {
  try {
    const { ticketId, reason } = req.body;

    if (!ticketId) {
      return error(res, "Ticket ID required", 400);
    }

    const mobile = req.userId;
    const user = await getUserDetail(mobile);

    if (!user?.status) {
      return error(res, "User not found", 404);
    }

    const result = await cancelTicketWithRefundService(
      ticketId,
      user.user.id,
      reason || null
    );

    const msg = result.refund
      ? `Ticket cancelled · refund of ₹${result.refund.amount} initiated`
      : "Ticket cancelled successfully";

    return success(res, result, msg);
  } catch (err) {
    return error(res, err.message || "Could not cancel ticket", 400);
  }
};
export const updateTicketStatus = async (req, res, next) => {
  try {
    const { qrHash, action } = req.body;

    if (!qrHash || !action) {
      return error(res, "qrHash and action required", 400);
    }
    const mobile = req.userId;
    const user = await getUserDetail(mobile);
    if (!user?.status) {
        return error(res, "User not found", 404);
        }
    const result = await updateTicketStatusService(
      qrHash,
      user.user.id,
      action
    );

    return success(res, result, "Ticket updated");
  } catch (err) {
    next(err);
  }
};

export const freeTicket = async (req, res, next) => {
  console.log("Free ticket API called with body:", req.body); // Debug log
  try {
    const { ticket_type_id, event_id } = req.body;
    const mobile = req.userId;

    const user = await getUserDetail(mobile);

    if (!user?.status) {
      return error(res, "User not found", 404);
    }

    const result = await freeTicketService(
      ticket_type_id,
      event_id,
      user.user.id
    );

    return success(res, result, "Free ticket created successfully");
  } catch (err) {
    next(err);
  }
};
