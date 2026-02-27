const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const { contactLimiter } = require("../../middlewares/rateLimit.middleware");
const contactController = require("../../controllers/api/contact.controller");

const router = express.Router();

// POST /api/contact
router.post("/contact", contactLimiter, asyncHandler(contactController.submit));

module.exports = router;
