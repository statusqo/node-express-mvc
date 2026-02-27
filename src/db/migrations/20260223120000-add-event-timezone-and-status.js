"use strict";

/**
 * Add events.timezone (IANA) and events.eventStatus (active | cancelled | orphaned).
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("events", "timezone", {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn("events", "eventStatus", {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "active",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("events", "timezone");
    await queryInterface.removeColumn("events", "eventStatus");
  },
};
