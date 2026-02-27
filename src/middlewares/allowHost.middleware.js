// src/middlewares/allowHost.middleware.js
// Rejects requests whose Host header is not in the allowed list (prevents Host header misuse in redirects/CSRF).

const config = require("../config");

function hostnameFromHost(host) {
  if (!host || typeof host !== "string") return "";
  const s = host.trim();
  if (s.startsWith("[")) {
    const end = s.indexOf("]");
    return end > 0 ? s.slice(1, end).toLowerCase() : s.toLowerCase();
  }
  const colon = s.indexOf(":");
  return (colon > 0 ? s.slice(0, colon) : s).toLowerCase();
}

function allowHost(req, res, next) {
  const allowed = config.allowedHosts;
  if (!Array.isArray(allowed) || allowed.length === 0) {
    return next();
  }
  const hostname = hostnameFromHost(req.get("host") || "");
  if (!hostname || allowed.includes(hostname)) {
    return next();
  }
  res.status(400).send("Invalid Host header.");
}

module.exports = { allowHost };
