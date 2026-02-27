const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const collectionsController = require("../../controllers/web/collections.controller");

const router = express.Router();

router.get("/", asyncHandler(collectionsController.index));
router.get("/:slug", asyncHandler(collectionsController.show));

module.exports = router;
