const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const { contactLimiter } = require("../../middlewares/rateLimit.middleware");
const seminarsController = require("../../controllers/web/seminars.controller");

const router = express.Router();

router.get("/", asyncHandler(seminarsController.index));
router.post("/inquiry", contactLimiter, asyncHandler(seminarsController.submitInquiry));
router.get("/:slug", asyncHandler(seminarsController.show));

module.exports = router;
