const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const seminarsController = require("../../controllers/web/seminars.controller");

const router = express.Router();

router.get("/", asyncHandler(seminarsController.index));
router.get("/:slug", asyncHandler(seminarsController.show));

module.exports = router;
