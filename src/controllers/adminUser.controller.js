import {
  listUsersService,
  listValidatorsService,
  createValidatorService,
  setValidatorStatusService
} from "../services/adminUser.service.js";
import { success, error } from "../helpers/response.helper.js";

export const listUsers = async (req, res) => {
  try {
    return success(res, await listUsersService(req.query), "Users fetched");
  } catch (err) { return error(res, err.message, 400); }
};

export const listValidators = async (req, res) => {
  try {
    return success(res, await listValidatorsService(req.query), "Validators fetched");
  } catch (err) { return error(res, err.message, 400); }
};

export const createValidator = async (req, res) => {
  try {
    return success(res, await createValidatorService(req.body), "Validator created", 201);
  } catch (err) { return error(res, err.message, 400); }
};

export const setValidatorStatus = async (req, res) => {
  try {
    return success(res, await setValidatorStatusService(req.params.id, req.body?.status), "Validator status updated");
  } catch (err) { return error(res, err.message, 400); }
};
