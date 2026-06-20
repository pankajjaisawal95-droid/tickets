import { getEvent, getTicketTypes ,getEventForValidator, getSeatMap, getEventSeatMap} from "../controllers/event.controller.js";
import { accessTokenHeader } from "../constent/constent.js";
import { requireHeaders } from "../middlewares/requireHeaders.js";
import { authenticate } from "../middlewares/auth.middleware.js";

import express from "express";
const router = express.Router();
router.get('/getevent', getEvent);// requireHeaders([accessTokenHeader]), authenticate
router.get('/ticket-types/:eventId', getTicketTypes);
router.get('/seats/:ticketTypeId', getSeatMap);
router.get('/seatmap/:eventId', getEventSeatMap);
router.post(
  "/validator-event",
  requireHeaders([accessTokenHeader]),  // 🔐 header required
  authenticate,                         // 🔐 JWT verify
  getEventForValidator
);
export default router;