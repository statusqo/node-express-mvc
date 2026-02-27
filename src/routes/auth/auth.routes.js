// src/routes/auth/auth.routes.js
const express = require("express");
const passport = require("passport");
const asyncHandler = require("../../utils/asyncHandler");
const authController = require("../../controllers/auth/auth.controller");
const { authLimiter } = require("../../middlewares/rateLimit.middleware");
const config = require("../../config");

const router = express.Router();

router.get("/login", asyncHandler(authController.showLogin));
router.post("/login", authLimiter, authController.login);

router.get("/register", asyncHandler(authController.showRegister));
router.post("/register", authLimiter, asyncHandler(authController.register));

router.post("/logout", authController.logout);

const googleEnabled = config.auth?.google?.clientID && config.auth?.google?.clientSecret;
if (googleEnabled) {
  router.get(
    "/google",
    (req, res, next) => {
      const returnTo = req.query.returnTo;
      if (returnTo && typeof returnTo === "string") {
        try {
          const u = new URL(returnTo);
          const origin = (req.protocol || "http") + "://" + (req.get("host") || "");
          if (u.origin === origin) req.session.returnTo = returnTo;
        } catch (_) {}
        next();
      } else {
        next();
      }
    },
    passport.authenticate("google", { scope: ["profile", "email"] })
  );

  router.get(
    "/google/callback",
    passport.authenticate("google", { failureRedirect: "/auth/login", session: true }),
    (req, res, next) => {
      if (!req.user) return next();
      req.session.regenerate((err) => {
        if (err) return next(err);
        req.login(req.user, (loginErr) => {
          if (loginErr) return next(loginErr);
          next();
        });
      });
    },
    asyncHandler(authController.googleCallback)
  );
}

module.exports = router;