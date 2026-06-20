import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import corsMiddleware from './middlewares/cors.middleware.js';
import { geoLocation } from './middlewares/geo.middleware.js';
import routes from './routes/index.js';
import { ASSETS_DIR } from './config/paths.js';
import { imageFallback } from './controllers/upload.controller.js';
import swaggerUi from 'swagger-ui-express';
import swaggerFile from './config/swagger-output.json' assert { type: 'json' };

const app = express();

// Behind nginx/SSL the real client IP is in X-Forwarded-For — trust it so
// req.ip (and the geo middleware) read the user's address, not the proxy's.
app.set('trust proxy', true);

// Allow cross-origin <img> loading of uploaded assets (admin SPA on another port).
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(corsMiddleware);
// Resolve approximate user location (country/city) from IP on every request.
app.use(geoLocation);

// Serve uploaded images (banners, gallery, artists, ticket images).
// Anchored to backend/assets (cwd-independent) so it always matches the upload dir.
app.use('/assets', express.static(ASSETS_DIR));
// Fallback: resolve /assets/images/<...> by filename across all subfolders, so a
// stored URL pointing at the wrong subfolder still serves the file.
app.use('/assets/images', imageFallback);
// Razorpay webhook needs the RAW body for signature verification — must come
// BEFORE express.json() (which would otherwise consume/parse the stream).
app.use('/api/payment/webhook', express.raw({ type: '*/*' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerFile));



app.use('/api', routes);



export default app;
