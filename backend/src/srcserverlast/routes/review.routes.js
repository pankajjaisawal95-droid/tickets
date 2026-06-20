import { Router } from "express";
import { getReviews, submitReview } from "../controllers/review.controller.js";
import { accessTokenHeader } from "../constent/constent.js";
import { requireHeaders } from "../middlewares/requireHeaders.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

// Public: approved reviews shown in the home "What people are saying" section.
router.get("/", getReviews);

// Authenticated: a logged-in user submits their rating + comment.
router.post("/", requireHeaders([accessTokenHeader]), authenticate, submitReview);

export default router;
