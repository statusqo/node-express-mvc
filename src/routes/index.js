// src/routes/index.js
const express = require("express");

const webRouter = require("./web");
const apiRouter = require("./api");
const authRouter = require("./auth/auth.routes");

const router = express.Router();

router.use("/", webRouter);
router.use("/api", apiRouter);
router.use("/auth", authRouter);
// Admin mounted at /admin in app.js

module.exports = router;
