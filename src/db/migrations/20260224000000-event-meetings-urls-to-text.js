"use strict";

/**
 * Change event_meetings.joinUrl and event_meetings.startUrl from VARCHAR(255)
 * to TEXT so that Zoom start_url values (which embed a JWT and can exceed 500
 * characters) are stored without truncation.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("event_meetings", "joinUrl", {
      type: Sequelize.TEXT,
      allowNull: false,
    });
    await queryInterface.changeColumn("event_meetings", "startUrl", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("event_meetings", "joinUrl", {
      type: Sequelize.STRING,
      allowNull: false,
    });
    await queryInterface.changeColumn("event_meetings", "startUrl", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },
};
