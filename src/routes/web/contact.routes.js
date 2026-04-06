const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const { contactLimiter } = require("../../middlewares/rateLimit.middleware");
const contactController = require("../../controllers/web/contact.controller");

const router = express.Router();

router.get("/", asyncHandler(contactController.contact));
router.post("/", contactLimiter, asyncHandler(contactController.submit));

module.exports = router;
