const path = require('path');
const config = require('./index');

// Resolve storage to absolute path so CLI and app use the same file (cwd can differ)
const storagePath = config.db.dialect === 'sqlite' && config.db.storage
  ? path.resolve(process.cwd(), config.db.storage)
  : config.db.storage;

module.exports = {
  development: {
    dialect: config.db.dialect,
    storage: storagePath,
    logging: false
  },
  test: {
    dialect: config.db.dialect,
    storage: ':memory:',
    logging: false
  },
  production: {
    dialect: config.db.dialect,
    storage: storagePath,
    logging: false
  }
};
