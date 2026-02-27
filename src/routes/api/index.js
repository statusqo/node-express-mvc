const express = require("express");
const contactRoutes = require("./contact.routes");
const healthRoutes = require("./health.routes");
const cartRoutes = require("./cart.routes");

const router = express.Router();
router.use("/", contactRoutes);
router.use("/", healthRoutes);
router.use("/cart", cartRoutes);
// Note: Stripe webhook route is mounted directly in app.js before body parsing

module.exports = router;
