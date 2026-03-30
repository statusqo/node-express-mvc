const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const eventsController = require("../../controllers/admin/events.controller");

const router = express.Router();

router.get("/", asyncHandler(eventsController.index));
router.get("/:eventId/registrants", asyncHandler(eventsController.registrants));
router.post("/:eventId/registrants/:registrationId/cancel", asyncHandler(eventsController.cancelRegistrant));

module.exports = router;
