const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const blogController = require("../../controllers/web/blog.controller");

const router = express.Router();

router.get("/", asyncHandler(blogController.index));
router.get("/:slug", asyncHandler(blogController.show));

module.exports = router;
