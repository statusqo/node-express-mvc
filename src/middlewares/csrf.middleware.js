const config = require("../config");
const logger = require("../config/logger");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isSameOrigin(req) {
  const origin = req.get("origin") || req.get("referer");
  if (!origin) return false;

  try {
    const originUrl = new URL(origin);
    
    // Allow if origin matches the current request host (supporting subdomains)
    if (originUrl.host === req.get("host")) {
      return true;
    }

    // Fallback: Check against configured base URL (e.g. for cross-port dev if needed)
    const baseUrl = new URL(config.baseUrl);
    return originUrl.origin === baseUrl.origin;
  } catch {
    return false;
  }
}

function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  if (!isSameOrigin(req)) {
    const origin = req.get("origin") || "missing";
    const referer = req.get("referer") || "missing";
    const host = req.get("host") || "missing";

    logger.warn("CSRF blocked request", {
      url: req.originalUrl,
      origin,
      referer,
      host,
    });

    const err = new Error("Invalid request origin (CSRF protection).");
    err.status = 403;
    return next(err);
  }

  return next();
}

module.exports = { csrfProtection };
