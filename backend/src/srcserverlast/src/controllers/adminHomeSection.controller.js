import {
  listHomeSectionsService,
  listHomeSectionTypesService,
  createHomeSectionService,
  updateHomeSectionService,
  deleteHomeSectionService,
  reorderHomeSectionsService
} from "../services/adminHomeSection.service.js";
import { success, error } from "../helpers/response.helper.js";

export const listHomeSections = async (req, res) => {
  try {
    return success(res, await listHomeSectionsService(), "Home sections fetched");
  } catch (err) { return error(res, err.message, 400); }
};

export const listHomeSectionTypes = async (req, res) => {
  try {
    return success(res, await listHomeSectionTypesService(), "Home section types fetched");
  } catch (err) { return error(res, err.message, 400); }
};

export const createHomeSection = async (req, res) => {
  try {
    return success(res, await createHomeSectionService(req.body), "Home section created", 201);
  } catch (err) { return error(res, err.message, 400); }
};

export const updateHomeSection = async (req, res) => {
  try {
    return success(res, await updateHomeSectionService(req.params.id, req.body), "Home section updated");
  } catch (err) { return error(res, err.message, 400); }
};

export const deleteHomeSection = async (req, res) => {
  try {
    return success(res, await deleteHomeSectionService(req.params.id), "Home section removed");
  } catch (err) { return error(res, err.message, 400); }
};

export const reorderHomeSections = async (req, res) => {
  try {
    return success(res, await reorderHomeSectionsService(req.body.items), "Home sections reordered");
  } catch (err) { return error(res, err.message, 400); }
};
