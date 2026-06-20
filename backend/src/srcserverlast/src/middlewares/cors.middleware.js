import cors from 'cors';
import { getAllowedDomains } from '../services/cors.service.js';
import { error } from '../helpers/response.helper.js';

export default async function corsMiddleware(req, res, next) {
    const origin = req.headers.origin || req.headers["x-origin"];
    // Non-browser requests (Postman, mobile apps) → origin undefined
   
    if (!origin) return next();
    try {
        const allowedDomains = await getAllowedDomains();
        if (!allowedDomains.includes(origin)) {
            return error(res, 'CORS error: domain not allowed', 404);
        }

        // Origin allowed → use CORS
        cors({
            origin,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested', 'Accept','x-access-token','x-refresh-token']
        })(req, res, next);

    } catch (err) {
        console.error("err in CORS middleware:", err);
        return error(res, 'CORS validation failed', 500);
    }
}
