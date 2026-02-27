const client = require("./client");

module.exports = {
  sequelize: client.sequelize, // Export the Sequelize instance

  async connect() {
    await client.connect();
  },

  async disconnect() {
    await client.disconnect();
  },
};
