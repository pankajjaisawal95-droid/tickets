import { Router } from 'express';
import { listEmailHistory } from '../controllers/emailHistory.controller.js';
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
import {
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  setEventStatus,
  listTicketTypes,
  createTicketType,
  updateTicketType,
  deleteTicketType,
  generateSeats,
  importSeatLayout,
  listSeats,
  updateSeat,
  renameSeatRow,
  getEventAttendees,
  broadcastEventEmail,
  listCategories,
  listOrganizers,
  setOrganizerKyc
} from '../controllers/adminEvent.controller.js';
import {
  listHomeSections,
  listHomeSectionTypes,
  createHomeSection,
  updateHomeSection,
  deleteHomeSection,
  reorderHomeSections
} from '../controllers/adminHomeSection.controller.js';
import {
  listCoupons,
  getCoupon,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  listCouponRedemptions
} from '../controllers/adminCoupon.controller.js';
import {
  listOrders,
  getOrder,
  listRefunds,
  getRefund,
  refundOrder
} from '../controllers/adminOrder.controller.js';
import { getDashboard } from '../controllers/adminDashboard.controller.js';
import {
  listTickets,
  exportTickets,
  listEventScans,
  getScanAnalytics
} from '../controllers/adminTicket.controller.js';
import {
  listUsers,
  listValidators,
  createValidator,
  setValidatorStatus
} from '../controllers/adminUser.controller.js';
import {
  listPayments,
  listPaymentEvents
} from '../controllers/adminReconciliation.controller.js';
import { adminLogin } from '../controllers/adminAuth.controller.js';
import { listVisits, exportVisits } from '../controllers/visit.controller.js';
import { listContacts, exportContacts, updateContactStatus } from '../controllers/contact.controller.js';
import { listReviewsAdmin, updateReviewStatus } from '../controllers/review.controller.js';
import { uploadImage } from '../controllers/upload.controller.js';

import { accessTokenHeader } from '../constent/constent.js';
import { requireHeaders } from '../middlewares/requireHeaders.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/admin.middleware.js';

const router = Router();

/* -------- public admin auth (password login, NOT behind the guard) -------- */
router.post('/auth/login', adminLogin);

// Every other admin route: header present → token valid → admin role.
const guard = [requireHeaders([accessTokenHeader]), authenticate, requireAdmin];
router.use(guard);

/* --------------------------------- uploads -------------------------------- */
router.post('/upload', uploadImage);

/* ------------------------------- dashboard -------------------------------- */
router.get('/dashboard', getDashboard);

/* --------------------------------- events --------------------------------- */
router.get('/events', listEvents);
router.post('/events', createEvent);
router.get('/categories', listCategories);
router.get('/organizers', listOrganizers);
router.patch('/organizers/:id/kyc', setOrganizerKyc);
router.get('/events/:id', getEvent);
router.put('/events/:id', updateEvent);
router.patch('/events/:id/status', setEventStatus);

/* ------------------------------ ticket types ------------------------------ */
router.get('/events/:id/ticket-types', listTicketTypes);
router.post('/events/:id/ticket-types', createTicketType);
router.put('/ticket-types/:id', updateTicketType);
router.delete('/ticket-types/:id', deleteTicketType);
router.post('/ticket-types/:id/seats/generate', generateSeats);
router.post('/events/:id/seatmap/import', importSeatLayout);
router.get('/events/:id/attendees', getEventAttendees);
router.post('/events/:id/broadcast', broadcastEventEmail);
router.get('/ticket-types/:id/seats', listSeats);
router.put('/seats/:seatId', updateSeat);
router.put('/ticket-types/:id/seats/rename-row', renameSeatRow);

/* --------------------------- event media (extend) ------------------------- */
router.get('/event/:eventId/media', listEventMedia);
router.post('/event/:eventId/gallery', addGalleryImage);
router.put('/event/gallery/reorder', reorderGallery);
router.put('/event/gallery/:id', updateGalleryImage);
router.delete('/event/gallery/:id', deleteGalleryImage);
router.post('/event/:eventId/artist', addArtist);
router.put('/event/artist/reorder', reorderArtists);
router.put('/event/artist/:id', updateArtist);
router.delete('/event/artist/:id', deleteArtist);

/* ------------------------------ home sections ----------------------------- */
router.get('/home-sections', listHomeSections);
router.post('/home-sections', createHomeSection);
router.get('/home-section-types', listHomeSectionTypes);
// Bulk reorder ({items:[{id,sort_order}]}). `/:id/order` kept as a spec alias.
router.patch('/home-sections/reorder', reorderHomeSections);
router.patch('/home-sections/:id/order', reorderHomeSections);
router.put('/home-sections/:id', updateHomeSection);
router.delete('/home-sections/:id', deleteHomeSection);

/* --------------------------------- coupons -------------------------------- */
router.get('/coupons', listCoupons);
router.post('/coupons', createCoupon);
router.get('/coupons/:id', getCoupon);
router.put('/coupons/:id', updateCoupon);
router.delete('/coupons/:id', deleteCoupon);
router.get('/coupons/:id/redemptions', listCouponRedemptions);

/* ---------------------------- orders & refunds ---------------------------- */
router.get('/orders', listOrders);
router.get('/orders/:id', getOrder);
router.post('/orders/:id/refund', refundOrder);
router.get('/refunds', listRefunds);
router.get('/refunds/:id', getRefund);

/* ----------------------------- tickets & scans ---------------------------- */
router.get('/tickets', listTickets);
router.get('/tickets/export', exportTickets);   // ?format=csv|pdf → file download
router.get('/events/:id/scans', listEventScans);
router.get('/events/:id/scan-analytics', getScanAnalytics);

/* ----------------------------- users/validators --------------------------- */
router.get('/users', listUsers);
router.get('/validators', listValidators);
router.post('/validators', createValidator);
router.patch('/validators/:id/status', setValidatorStatus);

/* ------------------------------ email history ----------------------------- */
router.get('/email-history', listEmailHistory);

/* ----------------------------- reconciliation ----------------------------- */
router.get('/payments', listPayments);
router.get('/payment-events', listPaymentEvents);

/* ------------------------------- visit logs ------------------------------- */
router.get('/visits', listVisits);            // paginated list for the admin table
router.get('/visits/export', exportVisits);   // ?format=csv|pdf → file download

/* ----------------------------- contact messages --------------------------- */
router.get('/contacts', listContacts);            // paginated list for the admin table
router.get('/contacts/export', exportContacts);   // ?format=csv|pdf → file download
router.patch('/contacts/:id/read', updateContactStatus); // mark read / unread

/* -------------------------------- reviews --------------------------------- */
router.get('/reviews', listReviewsAdmin);                 // paginated list for moderation
router.patch('/reviews/:id/status', updateReviewStatus);  // approve / reject / re-queue

export default router;
