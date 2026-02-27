// src/config/allowedHosts.js
// In development we allow any Host (so ngrok, *.localhost, etc. work).
// In production we restrict to BASE_URL hostname or ALLOWED_HOSTS to prevent Host header misuse.
const { getEnv } = require("./env");

function getAllowedHosts() {
  if (getEnv("NODE_ENV", "development") !== "production") {
    return []; // no restriction: allow ngrok, something.localhost, etc.
  }
  const envList = getEnv("ALLOWED_HOSTS", "");
  if (envList) {
    return envList.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  }
  try {
    const u = new URL(getEnv("BASE_URL", ""));
    if (u.hostname) return [u.hostname.toLowerCase()];
  } catch (_) {}
  return [];
}

module.exports = { getAllowedHosts };
