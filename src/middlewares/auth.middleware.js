// src/middlewares/auth.middleware.js
function isApiRequest(req) {
  return req.baseUrl && req.baseUrl.startsWith("/api");
}

function isAdminRequest(req) {
  return req.originalUrl && req.originalUrl.startsWith("/admin");
}

/**
 * Style A: single middleware with web+api behavior
 */
function requireAuth(req, res, next) {
  if (req.user) {
    // If authenticated, perform role check for admin area
    if (isAdminRequest(req)) {
       // Check using the isAdmin flag from the database
       if (!req.user.isAdmin) {
           return res.redirect("/");
       }
    }
    return next();
  }

  if (isApiRequest(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  // Redirect to login for admin path; preserve full URL so we can redirect back after login
  if (isAdminRequest(req)) {
      if (req.originalUrl.startsWith("/auth/")) {
          return next();
      }
      const protocol = req.protocol || "http";
      const host = req.get("host") || "localhost:8080";
      const fullUrl = protocol + "://" + host + (req.originalUrl || "/");
      return res.redirect("/auth/login?returnTo=" + encodeURIComponent(fullUrl));
  }

  return res.redirect("/auth/login");
}

/**
 * Style B: explicit middlewares
 */
function requireWebAuth(req, res, next) {
  if (req.user) return next();
  return res.redirect("/auth/login");
}

function requireApiAuth(req, res, next) {
  if (req.user) return next();
  return res.status(401).json({ error: "unauthorized" });
}

module.exports = { requireAuth, requireWebAuth, requireApiAuth };