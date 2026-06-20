import { getOrganiserKycService, saveOrganiserKycService } from "../services/organiserKyc.service.js";
import { success, error } from "../helpers/response.helper.js";

/** GET /organiser/kyc — current KYC + bank details for the logged-in organiser. */
export const getOrganiserKyc = async (req, res) => {
  try {
    return success(res, await getOrganiserKycService(req.organiser.organizer.id), "KYC fetched");
  } catch (err) { return error(res, err.message, 400); }
};

/** PUT /organiser/kyc — save KYC + bank details (re-submits for admin review). */
export const saveOrganiserKyc = async (req, res) => {
  try {
    return success(res, await saveOrganiserKycService(req.organiser.organizer.id, req.body), "KYC submitted for review");
  } catch (err) { return error(res, err.message, 400); }
};
