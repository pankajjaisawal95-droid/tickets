import { updateOrganiserProfileService, changeOrganiserPasswordService } from "../services/organiserProfile.service.js";
import { success, error } from "../helpers/response.helper.js";

/** PUT /organiser/profile  { organization_name, email } */
export const updateOrganiserProfile = async (req, res) => {
  try {
    return success(res, await updateOrganiserProfileService(req.organiser, req.body), "Profile updated");
  } catch (err) { return error(res, err.message, 400); }
};

/** PUT /organiser/password  { current_password, new_password } */
export const changeOrganiserPassword = async (req, res) => {
  try {
    return success(res, await changeOrganiserPasswordService(req.organiser.user.id, req.body), "Password changed");
  } catch (err) { return error(res, err.message, 400); }
};
