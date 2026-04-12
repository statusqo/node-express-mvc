const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const ordersController = require("../../controllers/web/orders.controller");
const { requireWebAuth } = require("../../middlewares/auth.middleware");

const router = express.Router();

router.get("/", requireWebAuth, asyncHandler(ordersController.list));
router.get("/:id", requireWebAuth, asyncHandler(ordersController.show));
router.post("/:id/refund-request", requireWebAuth, asyncHandler(ordersController.refundRequest));

module.exports = router;
