const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const contactController = require("../../controllers/web/contact.controller");

const router = express.Router();

router.get("/", asyncHandler(contactController.contact));

module.exports = router;
