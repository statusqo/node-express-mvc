const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const productsController = require("../../controllers/web/products.controller");

const router = express.Router();

router.get("/", asyncHandler(productsController.index));
router.get("/:slug", asyncHandler(productsController.show));

module.exports = router;
