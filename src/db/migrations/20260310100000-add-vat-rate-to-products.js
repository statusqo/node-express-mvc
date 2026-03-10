"use strict";

/**
 * Add vatRate to products.
 * Stored as a percentage integer (0, 5, 13, 25) matching Croatian PDV rates.
 * Default 25 — the standard Croatian VAT rate.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("products", "vatRate", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 25,
      after: "weightUnit",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("products", "vatRate");
  },
};
