// src/config/logger.js
const COLORS = {
  debug: "\x1b[2m",   // dim
  info:  "\x1b[36m",  // cyan
  warn:  "\x1b[33m",  // yellow
  error: "\x1b[31m",  // red
};
const RESET = "\x1b[0m";

const isTTY = Boolean(process.stdout.isTTY);

function colorize(level, str) {
  if (!isTTY) return str;
  return `${COLORS[level] || ""}${str}${RESET}`;
}

function buildEntry(level, msg, meta) {
  return {
    timestamp: new Date().toISOString(),
    level,
    message: msg,
    ...(meta || {})
  };
}

const logger = {
  debug: (msg, meta) => console.log(colorize("debug", JSON.stringify(buildEntry("debug", msg, meta)))),
  info:  (msg, meta) => console.log(colorize("info",  JSON.stringify(buildEntry("info",  msg, meta)))),
  warn:  (msg, meta) => console.warn(colorize("warn",  JSON.stringify(buildEntry("warn",  msg, meta)))),
  error: (msg, meta) => console.error(colorize("error", JSON.stringify(buildEntry("error", msg, meta)))),
};

module.exports = logger;
