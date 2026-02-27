const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const cartController = require("../../controllers/web/cart.controller");

const router = express.Router();

router.get("/", asyncHandler(cartController.show));
router.post("/add", asyncHandler(cartController.add));
router.post("/update", asyncHandler(cartController.update));
router.post("/remove", asyncHandler(cartController.remove));

module.exports = router;
