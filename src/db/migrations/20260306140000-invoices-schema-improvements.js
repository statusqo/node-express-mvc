"use strict";

/**
 * Invoice schema improvements:
 *  1. Add status column ENUM('issued', 'voided') DEFAULT 'issued'
 *  2. Add UNIQUE index on (sequenceNumber, year, type) so sequence
 *     uniqueness is enforced at the DB level, not just through the
 *     derived invoiceNumber string.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("invoices", "status", {
      type: Sequelize.ENUM("issued", "voided"),
      allowNull: false,
      defaultValue: "issued",
      after: "year",
    });

    await queryInterface.addIndex("invoices", ["sequenceNumber", "year", "type"], {
      unique: true,
      name: "invoices_sequence_year_type_unique",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("invoices", "invoices_sequence_year_type_unique");
    await queryInterface.removeColumn("invoices", "status");
  },
};
