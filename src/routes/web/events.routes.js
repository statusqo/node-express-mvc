const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const eventsController = require("../../controllers/web/events.controller");

const router = express.Router();

// GET /events — category picker
router.get("/", asyncHandler(eventsController.index));

// GET /events/:categorySlug — product listing for a category
router.get("/:categorySlug", asyncHandler(eventsController.categoryListing));

// GET /events/:categorySlug/:productSlug — product detail
router.get("/:categorySlug/:productSlug", asyncHandler(eventsController.show));

// GET /events/:categorySlug/:productSlug/register — registration form
router.get("/:categorySlug/:productSlug/register", asyncHandler(eventsController.registerForm));

// POST /events/:categorySlug/:productSlug/place-order — create order
router.post("/:categorySlug/:productSlug/place-order", asyncHandler(eventsController.placeOrder));

// GET /events/:categorySlug/:productSlug/buy — legacy redirect to register
router.get("/:categorySlug/:productSlug/buy", asyncHandler(eventsController.redirectBuyToRegister));

module.exports = router;
