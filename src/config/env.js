// src/config/env.js
const path = require("path");

function loadEnv() {
  // In production, env vars should be injected by the platform.
  if (process.env.NODE_ENV === "production") return;

  // Optional dependency: dotenv (we’ll add it in packages later)
  try {
    // Load .env (or you can implement dotenv-flow later)
    require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });
  } catch {
    // If dotenv isn't installed yet, silently ignore.
  }
}

function getEnv(name, defaultValue = "") {
  const val = process.env[name];
  if (val === undefined || val === "") {
    return defaultValue;
  }
  return val;
}

module.exports = { loadEnv, getEnv };
