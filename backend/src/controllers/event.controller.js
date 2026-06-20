
import { getEventService ,getEventForValidatorService, getSeatMapService, getEventSeatMapService} from "../services/event.service.js";
import {success,error} from '../helpers/response.helper.js';
import { getTicketTypesByEventService } from "../services/event.service.js";
import * as authService from '../services/auth.service.js';
import { verifyAccessToken } from '../helpers/jwt.helpers.js';

export const getEvent = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const page = parseInt(req.query.page) || 1;
    let { eventId } = req.query;

    // 🔥 default value
    eventId = eventId ? Number(eventId) : 1;
    const offset = (page - 1) * limit;

    const events = await getEventService(eventId,limit, offset);
    return success(res, { events });
  } catch (err) {
    next(err);
  }
};

export const getTicketTypes = async (req, res, next) => {
  try {
    const eventId = req.params.eventId;

    // Optional auth: this route is public, but if a valid token is present we
    // resolve the user so each ticket type can carry their already-held count
    // (user_held). An invalid/expired token just falls back to guest (null).
    let userId = null;
    const token = req.headers['x-access-token'];
    if (token) {
      try {
        const decoded = await verifyAccessToken(token);
        userId = decoded?.userId ?? null;
      } catch {
        userId = null;
      }
    }

    const ticketTypes = await getTicketTypesByEventService(eventId, userId);
    return success(res, { ticketTypes });
  } catch (err) {
    next(err);
  }
};
export const getSeatMap = async (req, res, next) => {
  try {
    const ticketTypeId = Number(req.params.ticketTypeId);
    if (!ticketTypeId) return error(res, "ticketTypeId required", 400);
    const seats = await getSeatMapService(ticketTypeId);
    return success(res, { seats });
  } catch (err) {
    next(err);
  }
};
export const getEventSeatMap = async (req, res, next) => {
  try {
    const eventId = Number(req.params.eventId);
    if (!eventId) return error(res, "eventId required", 400);
    const data = await getEventSeatMapService(eventId);
    return success(res, data);
  } catch (err) {
    next(err);
  }
};
export const getEventForValidator = async (req, res, next) => {
  try {
   
    const mobile = req.userId; // coming from auth middleware

    if (!mobile) {
      return error(res, "Unauthorized", 401);
    }

 
    // 🔐 Verify validator user
    const userVerified = await authService.user_verified(mobile);

    if (!userVerified?.status) {
      return error(res, userVerified?.message || "Unauthorized", 401);
    }

    const validatorId = userVerified.user?.id;

    if (!validatorId) {
      return error(res, "Invalid validator account", 401);
    }

    // 🔎 Get event
    const event = await getEventForValidatorService(
      Number(validatorId)
    );

    if (!event) {
      return error(res, "Event not found or access denied", 403);
    }

    return success(res, { event });

  } catch (err) {
    next(err);
  }
};

