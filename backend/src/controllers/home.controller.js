import {getHomePageService} from "../services/home.service.js";
import { success, error } from '../helpers/response.helper.js';

export const getHomePage = async (req, res) => {
  try {

    const data = await getHomePageService();

    return success(res, data, "Home data fetched");

  } catch (err) {
    console.error("Error in getHomePage controller:", err);
    return error(res, "Something went wrong", 500);
  }
};
