"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE product_prices SET currency = 'EUR' WHERE currency != 'EUR'`
    );
  },

  async down(queryInterface) {
    // No rollback — we cannot know which rows were originally USD
  },
};
