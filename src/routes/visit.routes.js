import { Router } from "express";
import { trackVisit, visitStats } from "../controllers/visit.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { optionalAuthenticate } from "../middlewares/optionalAuth.middleware.js";
import { requireAdmin } from "../middlewares/admin.middleware.js";

const router = Router();

// Public: frontend calls this on page load to record the visitor's location.
// optionalAuthenticate attaches req.userId when signed in, but allows anonymous
// visitors through too — so a row is stored in BOTH cases.
router.post("/visit", optionalAuthenticate, trackVisit);

// Admin: location stats (counts by country / city).
router.get("/stats", authenticate, requireAdmin, visitStats);

export default router;
