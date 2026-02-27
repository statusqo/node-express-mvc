// src/routes/home.routes.js
const express = require("express");

const asyncHandler = require("../../utils/asyncHandler");
const homeController = require("../../controllers/web/home.controller");

const router = express.Router();

router.get("/", asyncHandler(homeController.index));

module.exports = router;