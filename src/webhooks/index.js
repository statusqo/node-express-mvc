const { Router } = require("express");
const express = require("express");
const stripeWebhook = require("./stripe.webhook");
const zoomWebhook = require("./zoom.webhook");

const router = Router();

// All webhook routes receive the raw body for signature verification.
// This must come before any JSON/urlencoded body parsers in app.js.
router.use(express.raw({ type: "application/json" }));

router.post("/stripe", async (req, res, next) => {
  try {
    await stripeWebhook.webhook(req, res);
  } catch (err) {
    next(err);
  }
});

router.post("/zoom", async (req, res, next) => {
  try {
    await zoomWebhook.webhook(req, res);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
