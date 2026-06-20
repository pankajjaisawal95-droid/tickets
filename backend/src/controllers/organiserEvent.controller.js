import {
  listOrganiserEventsService,
  createOrganiserEventService,
  updateOrganiserEventService,
  submitOrganiserEventService
} from "../services/organiserEvent.service.js";
import { getEventService, getEventAttendeesService } from "../services/adminEvent.service.js";
import { listEventScansService } from "../services/adminTicket.service.js";
import { getEventAnalyticsService } from "../services/organiserAnalytics.service.js";
import { success, error } from "../helpers/response.helper.js";

const friendly = (err) => {
  if (err?.code === "ER_NO_REFERENCED_ROW_2" || err?.code === "ER_NO_REFERENCED_ROW") {
    return "Invalid reference: the selected category does not exist";
  }
  return err.message;
};

/** GET /organiser/me — profile + KYC status (drives the dashboard gate). */
export const organiserMe = async (req, res) => {
  const { user, organizer } = req.organiser;
  return success(res, {
    name: user.name,
    mobile: user.mobile,
    email: user.email,
    organization_name: organizer.organization_name,
    contact_email: organizer.contact_email,
    kyc_status: organizer.kyc_status,
    is_approved: organizer.kyc_status === "APPROVED"
  }, "Profile fetched");
};

export const listOrganiserEvents = async (req, res) => {
  try {
    const data = await listOrganiserEventsService(req.organiser.organizer.id, req.query);
    return success(res, data, "Events fetched");
  } catch (err) { return error(res, err.message, 400); }
};

/** Reuses the admin getEventService; ownership is enforced by middleware. */
export const getOrganiserEvent = async (req, res) => {
  try {
    return success(res, await getEventService(req.params.id), "Event fetched");
  } catch (err) { return error(res, err.message, err.message === "Event not found" ? 404 : 400); }
};

export const createOrganiserEvent = async (req, res) => {
  try {
    const data = await createOrganiserEventService(req.organiser.organizer.id, req.body);
    return success(res, data, "Event created", 201);
  } catch (err) { return error(res, friendly(err), 400); }
};

export const updateOrganiserEvent = async (req, res) => {
  try {
    return success(res, await updateOrganiserEventService(req.params.id, req.body), "Event updated");
  } catch (err) { return error(res, friendly(err), 400); }
};

/** Submit for admin review — blocked until the organiser's KYC is approved. */
export const submitOrganiserEvent = async (req, res) => {
  try {
    if (req.organiser.organizer.kyc_status !== "APPROVED") {
      return error(res, "Your organiser account is awaiting admin approval. You can't submit events yet.", 403);
    }
    return success(res, await submitOrganiserEventService(req.params.id), "Event submitted for review");
  } catch (err) { return error(res, err.message, 400); }
};

/* ----------------------- per-event analytics (own only) ------------------- */

export const getOrganiserEventAnalytics = async (req, res) => {
  try {
    return success(res, await getEventAnalyticsService(req.params.id), "Analytics fetched");
  } catch (err) { return error(res, err.message, 400); }
};

export const getOrganiserEventScans = async (req, res) => {
  try {
    return success(res, await listEventScansService(req.params.id, req.query), "Scans fetched");
  } catch (err) { return error(res, err.message, 400); }
};

export const getOrganiserEventAttendees = async (req, res) => {
  try {
    const list = await getEventAttendeesService(req.params.id, req.query.audience);
    return success(res, { count: list.length, attendees: list }, "Attendees fetched");
  } catch (err) { return error(res, err.message, 400); }
};
