const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const eventTypeProductsController = require("../../controllers/admin/eventTypeProducts.controller");

const router = express.Router({ mergeParams: true });

router.use((req, res, next) => {
  req.eventTypeSlug = "seminar";
  req.sectionPath = "seminars";
  next();
});

router.get("/", asyncHandler(eventTypeProductsController.index));
router.get("/:productSlug/events", asyncHandler(eventTypeProductsController.eventsPage));
router.get("/:productSlug/events/new", asyncHandler(eventTypeProductsController.newEventForm));
router.post("/:productSlug/events/new", asyncHandler(eventTypeProductsController.createEvent));
router.post("/:productSlug/events", asyncHandler(eventTypeProductsController.eventsSave));
router.post("/:productSlug/events/sync-zoom", asyncHandler(eventTypeProductsController.syncZoom));
router.get("/:productSlug/events/:eventId/edit", asyncHandler(eventTypeProductsController.editEventForm));
router.post("/:productSlug/events/remove-event", asyncHandler(eventTypeProductsController.removeEvent));
router.post("/:productSlug/events/cancel-event", asyncHandler(eventTypeProductsController.cancelEvent));
router.post("/:productSlug/events/resync-event", asyncHandler(eventTypeProductsController.resyncEvent));

module.exports = router;
