const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const { contactLimiter } = require("../../middlewares/rateLimit.middleware");
const seminarsController = require("../../controllers/api/seminars.controller");

const router = express.Router();

router.post("/seminars/inquiry", contactLimiter, asyncHandler(seminarsController.submitInquiry));

module.exports = router;
