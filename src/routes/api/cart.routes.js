const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const cartApiController = require("../../controllers/api/cart.controller");

const router = express.Router();

router.get("/", asyncHandler(cartApiController.getCart));
router.post("/add", asyncHandler(cartApiController.add));
router.post("/update", asyncHandler(cartApiController.update));
router.post("/remove", asyncHandler(cartApiController.remove));

module.exports = router;
