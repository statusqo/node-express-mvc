const crypto = require("crypto");
const logger = require("../config/logger");

const SKIP_PREFIXES = ["/public/", "/uploads/", "/favicon"];

function requestLogger(req, res, next) {
  if (SKIP_PREFIXES.some((p) => req.path.startsWith(p))) return next();

  const requestId = crypto.randomUUID();
  req.id = requestId;
  res.setHeader("x-request-id", requestId);

  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    logger.info("Request completed", {
      requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
    });
  });

  next();
}

module.exports = { requestLogger };
