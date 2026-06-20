import fs from 'fs';
import https from 'https';
import dotenv from 'dotenv';
import app from './app.js';
import { ensureEmailHistoryTable } from './services/emailHistory.service.js';
import { ensurePaymentSchema, ensureEventMediaTables, ensureAdminSchema } from './services/schema.service.js';
import { startBackgroundJobs } from './jobs/payment.jobs.js';



const PORT = process.env.PORT || 5320;
const BASE_URL = process.env.BASE_URL || 'http://localhost';

// Ensure auxiliary tables/columns exist (background-safe, never blocks startup),
// then start recurring jobs once the payment schema is in place.
ensureEmailHistoryTable();
ensureEventMediaTables();
ensureAdminSchema();
ensurePaymentSchema().then(startBackgroundJobs);
// SSL config
const sslOptions = {
    key: fs.readFileSync(process.env.SSL_KEY_PATH),
    cert: fs.readFileSync(process.env.SSL_CERT_PATH),
};

// // Start HTTPS server
 const server = https.createServer(sslOptions, app);
// const server = app.listen(PORT, () => {
//     console.log(`✅ Server running on ${BASE_URL}:${PORT}`);
// }
// );

server.listen(PORT, () => {
    console.log(`✅ HTTPS server running on ${BASE_URL}:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Server shutting down...');
    server.close(() => {
        process.exit(0);
    });
});
