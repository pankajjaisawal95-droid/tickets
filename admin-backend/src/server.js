import fs from 'fs';
import https from 'https';
import dotenv from 'dotenv';
import app from './app.js';
import { ensureEmailHistoryTable } from './services/emailHistory.service.js';
import { ensurePaymentSchema, ensureEventMediaTables, ensureAdminSchema, ensureSeatingSchema, ensureOrganiserSchema } from './services/schema.service.js';
import { ensureVisitLogTable } from './services/visit.service.js';
import { ensureContactTable } from './services/contact.service.js';
import { ensureReviewTable } from './services/review.service.js';
// NOTE: payment background jobs are intentionally NOT started here — the main
// backend already runs them; a second copy on the same DB would double-process
// holds/refunds.

const PORT = process.env.PORT || 5050;
const BASE_URL = process.env.BASE_URL || 'http://localhost';

// Ensure auxiliary tables/columns exist (idempotent; background-safe). The
// recurring payment jobs are owned by the main backend, so we don't start them.
ensureEmailHistoryTable();
ensureEventMediaTables();
ensureAdminSchema();
ensureOrganiserSchema();
ensureVisitLogTable();
ensureContactTable();
ensureReviewTable();
ensureSeatingSchema();
ensurePaymentSchema();
// SSL config
// const sslOptions = {
//     key: fs.readFileSync(process.env.SSL_KEY_PATH),
//     cert: fs.readFileSync(process.env.SSL_CERT_PATH),
// };

// // Start HTTPS server
// const server = https.createServer(sslOptions, app);
const server = app.listen(PORT, () => {
    console.log(`✅ Server running on ${BASE_URL}:${PORT}`);
}
);

// server.listen(PORT, () => {
//     console.log(`✅ HTTPS server running on ${BASE_URL}:${PORT}`);
// });

// Graceful shutdown
// process.on('SIGTERM', () => {
//     console.log('🛑 Server shutting down...');
//     server.close(() => {
//         process.exit(0);
//     });
// });
