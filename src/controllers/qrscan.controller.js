import * as qrService from '../services/qr.service.js';
import { success, error } from '../helpers/response.helper.js';
import { accessTokenHeader } from '../constent/constent.js';
import { verifyAccessToken } from '../helpers/jwt.helpers.js'
import { formatQrDetail } from '../utils/qrFormatter.js';
import {scanTicketUsedService } from '../services/ticket.service.js';
import { getvalidaterdetails } from "../services/auth.service.js";
export const qrScan = async (req, res) => {
    try {
        const accessToken = req.headers[accessTokenHeader];
        const decodeToken = await verifyAccessToken(accessToken);

        if (!decodeToken) {
            return error(res, "token expire or invalid", 401);
        }

        const { qrCode } = req.body;

        const qrDetail = await qrService.get_detail(qrCode);
        if (!qrDetail || qrDetail.length === 0) {
            return error(res, "Invalid QR Code", 404);
        }

        const formattedData = formatQrDetail(qrCode, qrDetail);
// console.log('formattedData',formattedData)
        return success(res, formattedData, "QR scanned successfully");

    } catch (err) {
        console.error(err);
        return error(res, "Something went wrong", 500);
    }
};
export const scannedTicket = async (req, res) => {
  try {
    const accessToken = req.headers["x-access-token"];
    const decoded = await verifyAccessToken(accessToken);

    if (!decoded) {
      return error(res, "Token expired or invalid", 401);
    }

    const mobile = req.userId;
    const user = await getvalidaterdetails(mobile);

    if (!user?.status) {
      return error(res, "User not found", 404);
    }

    const { eventId, qrCode, tickets } = req.body;
       console.log('data',req.body);
    if (!eventId || !qrCode || !tickets?.length) {
      return error(res, "Invalid request payload", 400);
    }

    /* 🔍 Get QR Details */
    const qrDetail = await qrService.get_detail(qrCode);

    if (!qrDetail || qrDetail.length === 0) {
      return error(res, "Invalid QR Code", 404);
    }

    /* 🧠 Validate Event */
    if (qrDetail[0].eventId !== eventId) {
      return error(res, "Event mismatch", 400);
    }

    /* 🔄 Process each ticket type */
    const results = [];

    for (const item of tickets) {
      const { ticketId, usedTicket } = item;

      if (!ticketId || usedTicket <= 0) {
      //  console.log(' ',ticketTypeId,usedTicket)
        return error(res, "Invalid ticket data", 400);
      }

      const result = await scanTicketUsedService({
        ticketId: qrDetail[0].eventTicketId, // from QR
        ticketTypeId:ticketId,
        usedCount: usedTicket,
        scannedBy: user.user.id,
        deviceInfo: req.headers["user-agent"] || "UNKNOWN"
      });

      results.push(result);
    }

    return success(res, results, "Ticket scanned successfully");

  } catch (err) {
    return error(res, err.message || "Scan failed", 400);
  }
};





