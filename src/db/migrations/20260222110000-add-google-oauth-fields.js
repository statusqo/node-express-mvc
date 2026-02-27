"use strict";

/**
 * Add googleId to users for Google OAuth 2.0. Nullable and unique so we can
 * find/link accounts by Google sub without breaking existing local accounts.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("users", "googleId", {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addIndex("users", ["googleId"], {
      unique: true,
      name: "users_google_id_unique",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("users", "users_google_id_unique");
    await queryInterface.removeColumn("users", "googleId");
  },
};
