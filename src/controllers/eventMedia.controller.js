import {
  addGalleryImageService,
  deleteGalleryImageService,
  updateGalleryImageService,
  reorderGalleryService,
  addArtistService,
  deleteArtistService,
  updateArtistService,
  reorderArtistsService,
  listEventMediaService
} from "../services/eventMedia.service.js";
import { success, error } from "../helpers/response.helper.js";

export const listEventMedia = async (req, res) => {
  try {
    const data = await listEventMediaService(req.params.eventId);
    return success(res, data, "Event media fetched");
  } catch (err) {
    return error(res, err.message, 400);
  }
};

export const addGalleryImage = async (req, res) => {
  try {
    const data = await addGalleryImageService(req.params.eventId, req.body);
    return success(res, data, "Gallery image added");
  } catch (err) {
    return error(res, err.message, 400);
  }
};

export const deleteGalleryImage = async (req, res) => {
  try {
    const data = await deleteGalleryImageService(req.params.id);
    return success(res, data, "Gallery image removed");
  } catch (err) {
    return error(res, err.message, 400);
  }
};

export const updateGalleryImage = async (req, res) => {
  try {
    const data = await updateGalleryImageService(req.params.id, req.body);
    return success(res, data, "Gallery image updated");
  } catch (err) {
    return error(res, err.message, 400);
  }
};

export const reorderGallery = async (req, res) => {
  try {
    const data = await reorderGalleryService(req.body.items);
    return success(res, data, "Gallery reordered");
  } catch (err) {
    return error(res, err.message, 400);
  }
};

export const addArtist = async (req, res) => {
  try {
    const data = await addArtistService(req.params.eventId, req.body);
    return success(res, data, "Artist added");
  } catch (err) {
    return error(res, err.message, 400);
  }
};

export const deleteArtist = async (req, res) => {
  try {
    const data = await deleteArtistService(req.params.id);
    return success(res, data, "Artist removed");
  } catch (err) {
    return error(res, err.message, 400);
  }
};

export const updateArtist = async (req, res) => {
  try {
    const data = await updateArtistService(req.params.id, req.body);
    return success(res, data, "Artist updated");
  } catch (err) {
    return error(res, err.message, 400);
  }
};

export const reorderArtists = async (req, res) => {
  try {
    const data = await reorderArtistsService(req.body.items);
    return success(res, data, "Artists reordered");
  } catch (err) {
    return error(res, err.message, 400);
  }
};
