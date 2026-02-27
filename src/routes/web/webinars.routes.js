const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const eventTypeProductsController = require("../../controllers/web/eventTypeProducts.controller");

const router = express.Router({ mergeParams: true });

router.use((req, res, next) => {
  req.typeSlug = "webinar";
  req.sectionPath = "webinars";
  next();
});

router.get("/", asyncHandler(eventTypeProductsController.index));
router.get("/:slug/register", asyncHandler(eventTypeProductsController.registerForm));
router.post("/:slug/place-order", asyncHandler(eventTypeProductsController.placeOrder));
router.get("/:slug/buy", asyncHandler(eventTypeProductsController.redirectBuyToRegister));
router.get("/:slug", asyncHandler(eventTypeProductsController.show));

module.exports = router;
