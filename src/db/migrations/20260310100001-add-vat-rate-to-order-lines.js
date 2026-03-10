"use strict";

/**
 * Add vatRate to order_lines.
 * Snapshotted from the product at the time the order is placed.
 * Nullable to preserve historical orders created before fiscalisation.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("order_lines", "vatRate", {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
      after: "quantity",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("order_lines", "vatRate");
  },
};
