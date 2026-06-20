import { getDashboardService } from "../services/adminDashboard.service.js";
import { success, error } from "../helpers/response.helper.js";

export const getDashboard = async (req, res) => {
  try {
    return success(res, await getDashboardService(), "Dashboard fetched");
  } catch (err) {
    return error(res, err.message, 400);
  }
};
