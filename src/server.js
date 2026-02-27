// src/server.js
const app = require("./app");
const config = require("./config");
const logger = require("./config/logger");
const db = require("./db");

async function start() {
  await db.connect();

  const { validatePaymentConfig } = require("./gateways");
  validatePaymentConfig();

  const server = app.listen(config.port, () => {
    logger.info(`Server listening on http://localhost:${config.port}`, {
      env: config.env,
      db: config.db.dialect,
    });
  });

  // Graceful shutdown
  const shutdown = () => {
    logger.warn("Server is shutting down...");
    server.close(async () => {
      await db.disconnect();
      logger.info("HTTP server closed.");
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((err) => {
  logger.error("Failed to start server", { message: err.message, stack: err.stack });
  process.exit(1);
});