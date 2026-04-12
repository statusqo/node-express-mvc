const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const eventsController = require("../../controllers/admin/event-timeline.controller");

const router = express.Router();

router.get("/", asyncHandler(eventsController.index));
router.get("/:eventId/registrants/:registrationId/edit", asyncHandler(eventsController.registrantEditForm));
router.post("/:eventId/registrants/:registrationId/update", asyncHandler(eventsController.registrantUpdate));
router.post("/:eventId/registrants/:registrationId/retry-zoom", asyncHandler(eventsController.registrantRetryZoom));
router.post("/:eventId/registrants/:registrationId/remove-zoom", asyncHandler(eventsController.registrantRemoveZoom));
router.post("/:eventId/registrants/:registrationId/cancel", asyncHandler(eventsController.cancelRegistrant));
router.get("/:eventId/registrants", asyncHandler(eventsController.registrants));

module.exports = router;
