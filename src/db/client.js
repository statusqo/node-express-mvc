const { Sequelize } = require("sequelize");
const config = require("../config");
const logger = require("../config/logger");
const path = require("path");

let sequelize;

// ":memory:" is a special SQLite keyword — must NOT go through path.resolve()
const isInMemory = config.db.dialect === "sqlite" && config.db.storage === ":memory:";

if (config.db.dialect === "sqlite") {
  sequelize = new Sequelize({
    dialect: "sqlite",
    storage: isInMemory ? ":memory:" : path.resolve(process.cwd(), config.db.storage),
    logging: false,
  });
} else if (config.db.url) {
  sequelize = new Sequelize(config.db.url, {
    dialect: config.db.dialect,
    logging: (msg) => logger.info(msg),
  });
}

module.exports = {
  sequelize,
  
  async connect() {
    if (!sequelize) {
      logger.info("No database configuration found, skipping DB connection.");
      return;
    }
    try {
      await sequelize.authenticate();
      logger.info(`Database connected (${config.db.dialect})`);

      if (config.db.dialect === "sqlite") {
        if (isInMemory) {
          // WAL mode is file-based and does not apply to in-memory databases.
          // Run all migrations and seeders so the blank DB is fully ready.
          const { setupInMemoryDb } = require("../scripts/setupInMemoryDb");
          await setupInMemoryDb(sequelize);
        } else {
          // WAL mode allows concurrent readers during writes, eliminating SQLITE_BUSY
          // errors under moderate concurrency. busy_timeout makes SQLite wait up to
          // 5 s instead of throwing immediately when a lock is contested.
          // synchronous=NORMAL is safe with WAL and gives a modest write performance boost.
          await sequelize.query("PRAGMA journal_mode=WAL;");
          await sequelize.query("PRAGMA busy_timeout=5000;");
          await sequelize.query("PRAGMA synchronous=NORMAL;");
          logger.info("SQLite WAL mode enabled (busy_timeout=5000, synchronous=NORMAL)");
        }
      }
    } catch (err) {
      logger.error("Unable to connect to the database:", err);
      throw err;
    }
  },

  async disconnect() {
    if (sequelize) {
      await sequelize.close();
      logger.info("Database connection closed");
    }
  },
};
