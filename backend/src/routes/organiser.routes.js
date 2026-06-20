import { Router } from 'express';

import { organiserRegister, organiserLogin, organiserSendRegisterOtp } from '../controllers/organiserAuth.controller.js';
import {
  organiserMe,
  listOrganiserEvents,
  getOrganiserEvent,
  createOrganiserEvent,
  updateOrganiserEvent,
  submitOrganiserEvent,
  getOrganiserEventAnalytics,
  getOrganiserEventScans,
  getOrganiserEventAttendees
} from '../controllers/organiserEvent.controller.js';
import { getOrganiserKyc, saveOrganiserKyc } from '../controllers/organiserKyc.controller.js';
import { updateOrganiserProfile, changeOrganiserPassword } from '../controllers/organiserProfile.controller.js';

// Reuse the admin event/ticket/seat/media controllers verbatim — ownership is
// enforced per-route by ensureOrganiserOwnsEvent, so organisers only ever touch
// their own events.
import {
  listTicketTypes,
  createTicketType,
  updateTicketType,
  deleteTicketType,
  generateSeats,
  importSeatLayout,
  listSeats,
  updateSeat,
  renameSeatRow,
  listCategories
} from '../controllers/adminEvent.controller.js';
import {
  listEventMedia,
  addGalleryImage,
  deleteGalleryImage,
  updateGalleryImage,
  reorderGallery,
  addArtist,
  deleteArtist,
  updateArtist,
  reorderArtists
} from '../controllers/eventMedia.controller.js';
import { uploadImage } from '../controllers/upload.controller.js';

import { accessTokenHeader, refreshHeader } from '../constent/constent.js';
import { requireHeaders } from '../middlewares/requireHeaders.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { refreshToken } from '../controllers/auth.controller.js';
import {
  requireOrganiser,
  ensureOrganiserOwnsEvent,
  ensureOrganiserOwnsMediaItems
} from '../middlewares/organiser.middleware.js';

const router = Router();

/* ---- public organiser auth (email + password, NOT behind the guard) ---- */
router.post('/auth/register/send-otp', organiserSendRegisterOtp);
router.post('/auth/register', organiserRegister);
router.post('/auth/login', organiserLogin);
router.get('/auth/refresh-token', requireHeaders([refreshHeader]), refreshToken);

// Everything below: header present → token valid → organiser role + profile.
const guard = [requireHeaders([accessTokenHeader]), authenticate, requireOrganiser];
router.use(guard);

/* --------------------------------- profile -------------------------------- */
router.get('/me', organiserMe);
router.put('/profile', updateOrganiserProfile);
router.put('/password', changeOrganiserPassword);

/* ----------------------------- KYC + bank details ------------------------- */
router.get('/kyc', getOrganiserKyc);
router.put('/kyc', saveOrganiserKyc);

/* --------------------------------- uploads -------------------------------- */
router.post('/upload', uploadImage);

/* ------------------------------- categories ------------------------------- */
router.get('/categories', listCategories);

/* --------------------------- events (own only) ---------------------------- */
router.get('/events', listOrganiserEvents);
router.post('/events', createOrganiserEvent);
router.get('/events/:id', ensureOrganiserOwnsEvent('event', 'id'), getOrganiserEvent);
router.put('/events/:id', ensureOrganiserOwnsEvent('event', 'id'), updateOrganiserEvent);
router.post('/events/:id/submit', ensureOrganiserOwnsEvent('event', 'id'), submitOrganiserEvent);

/* --------------------- per-event analytics (own only) --------------------- */
router.get('/events/:id/analytics', ensureOrganiserOwnsEvent('event', 'id'), getOrganiserEventAnalytics);
router.get('/events/:id/scans', ensureOrganiserOwnsEvent('event', 'id'), getOrganiserEventScans);
router.get('/events/:id/attendees', ensureOrganiserOwnsEvent('event', 'id'), getOrganiserEventAttendees);

/* ------------------------------ ticket types ------------------------------ */
router.get('/events/:id/ticket-types', ensureOrganiserOwnsEvent('event', 'id'), listTicketTypes);
router.post('/events/:id/ticket-types', ensureOrganiserOwnsEvent('event', 'id'), createTicketType);
router.put('/ticket-types/:id', ensureOrganiserOwnsEvent('ticketType'), updateTicketType);
router.delete('/ticket-types/:id', ensureOrganiserOwnsEvent('ticketType'), deleteTicketType);

/* --------------------------------- seats ---------------------------------- */
router.post('/events/:id/seatmap/import', ensureOrganiserOwnsEvent('event', 'id'), importSeatLayout);
router.get('/ticket-types/:id/seats', ensureOrganiserOwnsEvent('ticketType'), listSeats);
router.post('/ticket-types/:id/seats/generate', ensureOrganiserOwnsEvent('ticketType'), generateSeats);
router.put('/ticket-types/:id/seats/rename-row', ensureOrganiserOwnsEvent('ticketType'), renameSeatRow);
router.put('/seats/:seatId', ensureOrganiserOwnsEvent('seat'), updateSeat);

/* ----------------------------- event media -------------------------------- */
// `reorder` must be registered before the `/:id` routes so it isn't captured as an id.
router.get('/event/:eventId/media', ensureOrganiserOwnsEvent('event', 'eventId'), listEventMedia);
router.post('/event/:eventId/gallery', ensureOrganiserOwnsEvent('event', 'eventId'), addGalleryImage);
router.put('/event/gallery/reorder', ensureOrganiserOwnsMediaItems('event_gallery'), reorderGallery);
router.put('/event/gallery/:id', ensureOrganiserOwnsEvent('gallery'), updateGalleryImage);
router.delete('/event/gallery/:id', ensureOrganiserOwnsEvent('gallery'), deleteGalleryImage);
router.post('/event/:eventId/artist', ensureOrganiserOwnsEvent('event', 'eventId'), addArtist);
router.put('/event/artist/reorder', ensureOrganiserOwnsMediaItems('event_artists'), reorderArtists);
router.put('/event/artist/:id', ensureOrganiserOwnsEvent('artist'), updateArtist);
router.delete('/event/artist/:id', ensureOrganiserOwnsEvent('artist'), deleteArtist);

export default router;
