const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const discountController = require("../../controllers/api/discount.controller");

const router = express.Router();

router.post("/apply", asyncHandler(discountController.apply));

module.exports = router;
