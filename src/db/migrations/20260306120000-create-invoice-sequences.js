"use strict";

/**
 * Create invoice_sequences table — one row per (type, year) pair.
 * The lastValue column is incremented atomically via a single SQL upsert,
 * replacing the MAX()+1 antipattern in the invoice service.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("invoice_sequences", {
      type: {
        type: Sequelize.STRING(10),
        allowNull: false,
        primaryKey: true,
      },
      year: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
      },
      lastValue: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("invoice_sequences");
  },
};
