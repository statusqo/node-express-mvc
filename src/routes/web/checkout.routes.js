const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const checkoutController = require("../../controllers/web/checkout.controller");

const router = express.Router();

router.get("/", asyncHandler(checkoutController.show));
router.post("/place-order", asyncHandler(checkoutController.placeOrderAndCreateInvoice));
router.post("/confirm-order", asyncHandler(checkoutController.confirmOrder));

module.exports = router;
