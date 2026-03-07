const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");

const ProcessedStripeEvent = sequelize.define("ProcessedStripeEvent", {
  eventId: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
}, {
  tableName: "processed_stripe_events",
  updatedAt: false,
});

module.exports = ProcessedStripeEvent;
