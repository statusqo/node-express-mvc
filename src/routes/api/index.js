const express = require("express");
const healthRoutes = require("./health.routes");
const cartRoutes = require("./cart.routes");

const router = express.Router();
router.use("/", healthRoutes);
router.use("/cart", cartRoutes);
// Note: Stripe webhook route is mounted directly in app.js before body parsing

module.exports = router;
