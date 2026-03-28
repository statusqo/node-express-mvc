const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const ordersController = require("../../controllers/web/orders.controller");

const router = express.Router();

router.get("/", asyncHandler(ordersController.list));
router.get("/:id", asyncHandler(ordersController.show));
router.post("/:id/refund-request", asyncHandler(ordersController.refundRequest));

module.exports = router;
