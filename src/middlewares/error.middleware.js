const logger = require("../config/logger");
const config = require("../config");

function errorHandler(err, req, res, next) {
  logger.error("Error", {
    requestId: req.id,
    message: err.message,
    stack: err.stack
  });

  const status = err.status || 500;
  const safeMessage = status < 500 && err.message ? err.message : "Something went wrong.";
  const isDev = config.env === "development";

  // If API route, send JSON
  if (req.originalUrl.startsWith("/api")) {
    const payload = { error: safeMessage, requestId: req.id };
    if (isDev && status >= 500) payload.detail = err.message;
    if (isDev && err.stack) payload.stack = err.stack;
    return res.status(status).json(payload);
  }

  // Admin path (/admin/...): render admin error page with admin layout
  const isAdminPath = req.originalUrl && req.originalUrl.startsWith("/admin");
  if (isAdminPath) {
    if (!res.locals.adminPrefix) res.locals.adminPrefix = "/admin";
    return res.status(status).render("admin/errors/error", {
      title: "Error",
      status,
      message: safeMessage,
      ...(isDev && status >= 500 && { detail: err.message, stack: err.stack })
    });
  }

  return res.status(status).render("web/errors/error", {
    title: "Error",
    status,
    message: safeMessage,
    ...(isDev && status >= 500 && { detail: err.message, stack: err.stack })
  });
}

module.exports = { errorHandler };
