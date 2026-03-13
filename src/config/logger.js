// src/config/logger.js
function buildEntry(level, msg, meta) {
  return {
    timestamp: new Date().toISOString(),
    level,
    message: msg,
    ...(meta || {})
  };
}

const logger = {
  debug: (msg, meta) => console.log(JSON.stringify(buildEntry("debug", msg, meta))),
  info: (msg, meta) => console.log(JSON.stringify(buildEntry("info", msg, meta))),
  warn: (msg, meta) => console.warn(JSON.stringify(buildEntry("warn", msg, meta))),
  error: (msg, meta) => console.error(JSON.stringify(buildEntry("error", msg, meta)))
};

module.exports = logger;
