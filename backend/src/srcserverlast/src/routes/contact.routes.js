import { Router } from "express";
import { submitContact } from "../controllers/contact.controller.js";

const router = Router();

// Public: the "Contact Us" page posts the form here. No auth required.
router.post("/", submitContact);

export default router;
