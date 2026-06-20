import { Router } from 'express';

import authRoutes from './auth.routes.js';
import eventRoutes from './event.routes.js';
import orderRoutes from './order.routes.js';
import paymentRoutes from './payment.routes.js';
import homeRoutes from './home.routes.js';
import qrscanRoutes from './qrscan.routes.js'
import ticketRoutes from './ticket.routes.js'
import adminRoutes from './admin.routes.js'
import organiserRoutes from './organiser.routes.js'
import visitRoutes from './visit.routes.js'
import contactRoutes from './contact.routes.js'
import reviewRoutes from './review.routes.js'

const router = Router();
console.log('Routes initialized');
router.use('/auth', authRoutes);
router.use('/event', eventRoutes);
router.use('/order', orderRoutes);
router.use('/payment', paymentRoutes);
router.use('/qrscan', qrscanRoutes);
router.use('/ticket', ticketRoutes);
router.use('/home', homeRoutes);
router.use('/admin', adminRoutes);
router.use('/organiser', organiserRoutes);
router.use('/track', visitRoutes);
router.use('/contact', contactRoutes);
router.use('/review', reviewRoutes);

export default router;
