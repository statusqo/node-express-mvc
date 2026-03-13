/**
 * Programmatic migration and seeder runner.
 *
 * Used exclusively when running SQLite in-memory (DB_STORAGE=:memory:) so the
 * app starts with a fully migrated and seeded database on every boot.
 *
 * Each migration/seeder file exports { up, down } — we call up() directly.
 * Files are executed in filename sort order (the timestamp prefix guarantees
 * correct dependency ordering).
 */

const path = require("path");
const fs   = require("fs");
const { Sequelize } = require("sequelize");
const logger = require("../config/logger");

const MIGRATIONS_DIR = path.join(__dirname, "../db/migrations");
const SEEDERS_DIR    = path.join(__dirname, "../db/seeders");

function loadFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .sort() // timestamp prefix guarantees correct order
    .map((f) => ({ name: f, module: require(path.join(dir, f)) }));
}

async function runMigrations(sequelize) {
  const queryInterface = sequelize.getQueryInterface();
  const migrations = loadFiles(MIGRATIONS_DIR);

  logger.info(`Running ${migrations.length} migration(s) against in-memory database...`);
  for (const { name, module: m } of migrations) {
    try {
      await m.up(queryInterface, Sequelize);
      logger.info(`  ✓ migration: ${name}`);
    } catch (err) {
      // some migrations may have been included in a later "create-all-tables"
      // snapshot; running them against a fresh database can trigger
      // duplicate‑column errors.  Log and continue rather than crashing.
      if (
        err.name === "SequelizeDatabaseError" &&
        err.parent &&
        err.parent.code === "SQLITE_ERROR" &&
        (
          /duplicate column name/i.test(err.parent.sql || "") ||
          /index .* already exists/i.test(err.parent.sql || "")
        )
      ) {
        logger.warn(
          `Skipping migration ${name}: ${err.parent.code} (${err.parent.sql})`
        );
        continue;
      }
      throw err;
    }
  }
}

async function runSeeders(sequelize) {
  const queryInterface = sequelize.getQueryInterface();
  const seeders = loadFiles(SEEDERS_DIR);

  logger.info(`Running ${seeders.length} seeder(s) against in-memory database...`);
  for (const { name, module: m } of seeders) {
    await m.up(queryInterface, Sequelize);
    logger.info(`  ✓ seeder: ${name}`);
  }
}

async function setupInMemoryDb(sequelize) {
  await runMigrations(sequelize);
  await runSeeders(sequelize);
  logger.info("In-memory database ready.");
}

module.exports = { setupInMemoryDb };
