const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const checkoutController = require("../../controllers/web/checkout.controller");

const router = express.Router();

router.get("/", asyncHandler(checkoutController.show));
router.post("/", asyncHandler(checkoutController.placeOrder));
router.post("/place-order", asyncHandler(checkoutController.placeOrderAndCreatePaymentIntent));
router.post("/confirm-order", asyncHandler(checkoutController.confirmOrder));
router.post("/pay/:id", asyncHandler(checkoutController.payOrder));

module.exports = router;
