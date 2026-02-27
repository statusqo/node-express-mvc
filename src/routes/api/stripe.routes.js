const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const stripeController = require("../../controllers/web/stripe.controller");

const router = express.Router();

// Stripe webhook endpoint
// Note: Raw body middleware is applied in app.js before general body parsing
router.post("/webhook", asyncHandler(stripeController.webhook));

module.exports = router;
