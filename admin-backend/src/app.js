import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import corsMiddleware from './middlewares/cors.middleware.js';
import { geoLocation } from './middlewares/geo.middleware.js';
import routes from './routes/index.js';
import { ASSETS_DIR } from './config/paths.js';
import { imageFallback } from './controllers/upload.controller.js';
import swaggerUi from 'swagger-ui-express';
import swaggerFile from './config/swagger-output.json' assert { type: 'json' };

// Built admin SPA lives at ticket/admin/dist (this file is admin-backend/src/app.js).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_DIST = path.resolve(__dirname, '..', '..', 'admin', 'dist');

const app = express();

// Behind nginx/SSL the real client IP is in X-Forwarded-For — trust it so
// req.ip (and the geo middleware) read the user's address, not the proxy's.
app.set('trust proxy', true);

// This admin server is reached over plain HTTP, so disable every helmet feature
// that assumes/forces HTTPS — otherwise the admin bundle won't load:
//   - contentSecurityPolicy: its default `upgrade-insecure-requests` makes the
//     browser refetch /assets/*.js over https://…:5050 (not served) → SSL error.
//   - hsts: Strict-Transport-Security would sticky-force https on this host.
//   - crossOriginOpenerPolicy / originAgentCluster: ignored on non-HTTPS origins
//     and only spam the console with warnings.
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
  hsts: false,
  crossOriginOpenerPolicy: false,
  originAgentCluster: false,
}));
app.use(corsMiddleware);
// Resolve approximate user location (country/city) from IP on every request.
app.use(geoLocation);

// Serve the built admin bundle FIRST. Vite emits its JS/CSS under /assets/, which
// would otherwise collide with the uploads handler below — serving it first means
// /assets/index-*.js|css resolve to the build, while /assets/images/* (which the
// build doesn't contain) falls through to the uploads handler.
app.use(express.static(ADMIN_DIST));

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

// ----------------------------- admin SPA build ----------------------------- //
// SPA fallback: any non-API, non-asset GET returns index.html so React Router can
// handle the client-side route. (The bundle's static files are already served
// above by express.static(ADMIN_DIST).)
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api') || req.path.startsWith('/assets') || req.path.startsWith('/api-docs')) return next();
  res.sendFile(path.join(ADMIN_DIST, 'index.html'), (err) => err && next());
});

export default app;
