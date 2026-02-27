const rateLimit = require("express-rate-limit");

const RATE_LIMIT_MESSAGE = "Too many requests, please try again later.";

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300,                 // 300 requests per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path.startsWith("/public"),
    message: RATE_LIMIT_MESSAGE,
    handler: (req, res) => {
        if (req.accepts("html")) {
            res.status(429).render("web/errors/rate-limit", {
                title: "Too Many Requests",
                message: RATE_LIMIT_MESSAGE
            });
        } else {
            res.status(429).json({ error: RATE_LIMIT_MESSAGE });
        }
    }
});

const contactLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 10,                  // 10 requests per IP per window
    standardHeaders: true,
    legacyHeaders: false
});

// Stricter limit for auth endpoints to mitigate brute-force
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,                  // 20 attempts per IP per window (login + register combined)
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many attempts. Please try again later." },
    handler: (req, res) => {
        if (req.accepts("html")) {
            if (req.session) req.session.flash = { type: "error", message: "Too many attempts. Please try again later." };
            res.redirect(req.originalUrl && req.originalUrl.startsWith("/auth/register") ? "/auth/register" : "/auth/login");
        } else {
            res.status(429).json({ error: "Too many attempts. Please try again later." });
        }
    },
});

module.exports = { globalLimiter, contactLimiter, authLimiter };
