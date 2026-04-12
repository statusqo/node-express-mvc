const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const discountController = require("../../controllers/api/discount.controller");
const { discountLimiter } = require("../../middlewares/rateLimit.middleware");

const router = express.Router();

router.post("/apply", discountLimiter, asyncHandler(discountController.apply));

module.exports = router;
