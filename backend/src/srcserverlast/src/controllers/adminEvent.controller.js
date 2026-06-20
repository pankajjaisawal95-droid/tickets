import {
  listEventsService,
  getEventService,
  createEventService,
  updateEventService,
  setEventStatusService,
  listTicketTypesService,
  createTicketTypeService,
  updateTicketTypeService,
  deleteTicketTypeService,
  generateSeatsService,
  importSeatLayoutService,
  listSeatsService,
  toggleSeatStatusService,
  updateSeatService,
  renameSeatRowService,
  getEventAttendeesService,
  broadcastEventEmailService,
  listCategoriesService,
  listOrganizersService
} from "../services/adminEvent.service.js";
import { success, error } from "../helpers/response.helper.js";

/** Maps DB foreign-key / constraint errors to a readable message. */
const friendly = (err) => {
  if (err?.code === "ER_NO_REFERENCED_ROW_2" || err?.code === "ER_NO_REFERENCED_ROW") {
    return "Invalid reference: the selected organizer or category does not exist";
  }
  return err.message;
};

/* events */
export const listEvents = async (req, res) => {
  try {
    return success(res, await listEventsService(req.query), "Events fetched");
  } catch (err) { return error(res, err.message, 400); }
};

export const getEvent = async (req, res) => {
  try {
    return success(res, await getEventService(req.params.id), "Event fetched");
  } catch (err) { return error(res, err.message, err.message === "Event not found" ? 404 : 400); }
};

export const createEvent = async (req, res) => {
  try {
    return success(res, await createEventService(req.body), "Event created", 201);
  } catch (err) { return error(res, friendly(err), 400); }
};

export const updateEvent = async (req, res) => {
  try {
    return success(res, await updateEventService(req.params.id, req.body), "Event updated");
  } catch (err) { return error(res, friendly(err), 400); }
};

export const setEventStatus = async (req, res) => {
  try {
    return success(res, await setEventStatusService(req.params.id, req.body), "Event status updated");
  } catch (err) { return error(res, err.message, 400); }
};

/* ticket types */
export const listTicketTypes = async (req, res) => {
  try {
    return success(res, await listTicketTypesService(req.params.id), "Ticket types fetched");
  } catch (err) { return error(res, err.message, 400); }
};

export const createTicketType = async (req, res) => {
  try {
    return success(res, await createTicketTypeService(req.params.id, req.body), "Ticket type created", 201);
  } catch (err) { return error(res, err.message, 400); }
};

export const updateTicketType = async (req, res) => {
  try {
    return success(res, await updateTicketTypeService(req.params.id, req.body), "Ticket type updated");
  } catch (err) { return error(res, err.message, 400); }
};

export const deleteTicketType = async (req, res) => {
  try {
    return success(res, await deleteTicketTypeService(req.params.id), "Ticket type removed");
  } catch (err) { return error(res, err.message, 400); }
};

/* seats */
export const generateSeats = async (req, res) => {
  try {
    return success(res, await generateSeatsService(req.params.id, req.body), "Seats generated", 201);
  } catch (err) { return error(res, err.message, 400); }
};

export const importSeatLayout = async (req, res) => {
  try {
    const { csv, aisle } = req.body;
    return success(res, await importSeatLayoutService(req.params.id, csv, { aisle }), "Seating layout imported", 201);
  } catch (err) { return error(res, err.message, 400); }
};

export const listSeats = async (req, res) => {
  try {
    return success(res, await listSeatsService(req.params.id), "Seats fetched");
  } catch (err) { return error(res, err.message, 400); }
};

export const toggleSeatStatus = async (req, res) => {
  try {
    return success(res, await toggleSeatStatusService(req.params.seatId, req.body.status), "Seat updated");
  } catch (err) { return error(res, err.message, 400); }
};

/* Relabel / move / enable-disable a single seat. */
export const updateSeat = async (req, res) => {
  try {
    return success(res, await updateSeatService(req.params.seatId, req.body), "Seat updated");
  } catch (err) { return error(res, err.message, 400); }
};

/* Rename a whole seat row (e.g. "C" -> "CD") for a ticket type. */
export const renameSeatRow = async (req, res) => {
  try {
    return success(res, await renameSeatRowService(req.params.id, req.body.from, req.body.to), "Row renamed");
  } catch (err) { return error(res, err.message, 400); }
};

/* broadcast email to attendees */
export const getEventAttendees = async (req, res) => {
  try {
    const list = await getEventAttendeesService(req.params.id, req.query.audience);
    return success(res, { count: list.length }, "Attendees fetched");
  } catch (err) { return error(res, err.message, 400); }
};

export const broadcastEventEmail = async (req, res) => {
  try {
    const result = await broadcastEventEmailService(req.params.id, req.body);
    return success(res, result, `Sent to ${result.sent} of ${result.total} attendees`);
  } catch (err) { return error(res, err.message, 400); }
};

/* categories */
export const listCategories = async (req, res) => {
  try {
    return success(res, await listCategoriesService(), "Categories fetched");
  } catch (err) { return error(res, err.message, 400); }
};

/* organizers */
export const listOrganizers = async (req, res) => {
  try {
    return success(res, await listOrganizersService(), "Organizers fetched");
  } catch (err) { return error(res, err.message, 400); }
};
