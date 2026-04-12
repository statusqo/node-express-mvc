const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const eventsController = require("../../controllers/admin/events.controller");

const router = express.Router();

// Category cards overview — GET /admin/events
router.get("/", asyncHandler(eventsController.categoryIndex));

// Products in a category — GET /admin/events/:categorySlug
router.get("/:categorySlug", asyncHandler(eventsController.index));

// Events list for a specific product
router.get("/:categorySlug/:productSlug/events", asyncHandler(eventsController.eventsPage));
router.get("/:categorySlug/:productSlug/events/new", asyncHandler(eventsController.newEventForm));
router.post("/:categorySlug/:productSlug/events/new", asyncHandler(eventsController.createEvent));
router.post("/:categorySlug/:productSlug/events", asyncHandler(eventsController.eventsSave));
router.post("/:categorySlug/:productSlug/events/sync-zoom", asyncHandler(eventsController.syncZoom));
router.get("/:categorySlug/:productSlug/events/:eventId/edit", asyncHandler(eventsController.editEventForm));
router.post("/:categorySlug/:productSlug/events/remove-event", asyncHandler(eventsController.removeEvent));
router.post("/:categorySlug/:productSlug/events/cancel-event", asyncHandler(eventsController.cancelEvent));
router.post("/:categorySlug/:productSlug/events/process-refunds", asyncHandler(eventsController.processEventCleanup));
router.post("/:categorySlug/:productSlug/events/reschedule-event", asyncHandler(eventsController.rescheduleEvent));
router.post("/:categorySlug/:productSlug/events/resync-event", asyncHandler(eventsController.resyncEvent));

module.exports = router;
