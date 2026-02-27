"use strict";

/**
 * Remove events.joiningLink (Zoom integration provides join URL via event_meetings.join_url).
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query("ALTER TABLE events DROP COLUMN joiningLink;");
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn("events", "joiningLink", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },
};
