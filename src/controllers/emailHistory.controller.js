import { getEmailHistory } from "../services/emailHistory.service.js";
import { success, error } from "../helpers/response.helper.js";

/**
 * GET /admin/email-history
 * Query: limit, offset, status (SENT|FAILED|SKIPPED), emailType, recipient
 */
export const listEmailHistory = async (req, res, next) => {
  try {
    const { limit, offset, status, emailType, recipient } = req.query;

    const result = await getEmailHistory({
      limit,
      offset,
      status,
      emailType,
      recipient
    });

    return success(res, result, "Email history fetched");
  } catch (err) {
    next(err);
  }
};
