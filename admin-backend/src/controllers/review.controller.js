import { success, error } from "../helpers/response.helper.js";
import {
  createReview,
  getApprovedReviews,
  getReviewerName,
  listReviews,
  setReviewStatus,
} from "../services/review.service.js";

/**
 * Public. Approved reviews for the home page "What people are saying" section.
 * Query: limit
 */
export const getReviews = async (req, res) => {
  try {
    const rows = await getApprovedReviews({ limit: req.query.limit });
    return success(res, rows, "Reviews fetched");
  } catch (err) {
    console.error("getReviews error:", err.message);
    return error(res, "Could not load reviews", 500);
  }
};

/**
 * Authenticated. A logged-in user submits / updates their review.
 * Body: { rating (1-5), comment, role? }
 * The display name is taken from the account — never trusted from the client.
 */
export const submitReview = async (req, res) => {
  try {
    const rating = Number(req.body?.rating);
    const comment = (req.body?.comment || "").trim();
    const role = (req.body?.role || "").trim();

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return error(res, "Please give a rating between 1 and 5 stars", 422);
    }
    if (comment.length < 10) {
      return error(res, "Please write at least a few words about your experience", 422);
    }
    if (comment.length > 1000) {
      return error(res, "Your review is a bit too long (max 1000 characters)", 422);
    }

    const name = await getReviewerName(req.userId);

    const id = await createReview({
      userId: req.userId,
      name,
      role: role || null,
      rating,
      comment,
      ip: req.geo?.ip || req.ip || null,
      userAgent: req.headers["user-agent"] || null,
    });

    return success(
      res,
      { id },
      "Thanks for sharing! Your review will appear once it's approved.",
      201
    );
  } catch (err) {
    console.error("submitReview error:", err.message);
    return error(res, "Could not submit your review. Please try again later.", 500);
  }
};

/**
 * Admin. Paginated list of reviews for moderation.
 * Query: limit, offset, search, status
 */
export const listReviewsAdmin = async (req, res) => {
  try {
    const { limit, offset, search, status } = req.query;
    const result = await listReviews({ limit, offset, search, status });
    return success(res, result, "Reviews fetched");
  } catch (err) {
    console.error("listReviewsAdmin error:", err.message);
    return error(res, "Could not load reviews", 500);
  }
};

/** Admin. Approves / rejects / re-queues a review. Body: { status } */
export const updateReviewStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const status = req.body?.status;
    if (!["pending", "approved", "rejected"].includes(status)) {
      return error(res, "Invalid status", 422);
    }
    const ok = await setReviewStatus(id, status);
    if (!ok) return error(res, "Review not found", 404);
    return success(res, { id: Number(id), status }, "Review updated");
  } catch (err) {
    console.error("updateReviewStatus error:", err.message);
    return error(res, "Could not update review", 500);
  }
};
