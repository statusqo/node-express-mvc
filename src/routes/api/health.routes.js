// src/routes/api/health.routes.js
const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const healthController = require("../../controllers/api/health.controller");

// const { requireAuth } = require("../../middlewares/auth.middleware");
const { requireApiAuth } = require("../../middlewares/auth.middleware");

const router = express.Router();

router.get("/", asyncHandler(healthController.publicHealth));

// protected example endpoint:
// router.get("/private", requireAuth, asyncHandler(healthController.privateHealth));
router.get("/private", requireApiAuth, asyncHandler(healthController.privateHealth));

module.exports = router;