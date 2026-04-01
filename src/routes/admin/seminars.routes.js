const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const seminarsController = require("../../controllers/admin/seminars.controller");

const router = express.Router();

router.get("/", asyncHandler(seminarsController.index));

module.exports = router;
