"use strict";

/**
 * Add posts.bodyIsHtml — flag to serve raw HTML documents without site chrome.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("posts", "bodyIsHtml", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("posts", "bodyIsHtml");
  },
};
