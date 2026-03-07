"use strict";

/**
 * Change invoices.orderId FK from ON DELETE CASCADE to ON DELETE RESTRICT.
 *
 * SQLite does not support ALTER TABLE DROP CONSTRAINT, so we recreate the
 * table with the correct definition, copy all data, drop the old table,
 * and rename the new one.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("invoices_new", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      orderId: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: "orders", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      invoiceNumber: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      type: {
        type: Sequelize.ENUM("receipt", "r1"),
        allowNull: false,
      },
      sequenceNumber: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      year: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      pdfPath: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      generatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });

    await queryInterface.sequelize.query(
      "INSERT INTO invoices_new SELECT * FROM invoices"
    );

    await queryInterface.dropTable("invoices");
    await queryInterface.renameTable("invoices_new", "invoices");

    await queryInterface.addIndex("invoices", ["orderId"], { unique: true });
    await queryInterface.addIndex("invoices", ["year", "type"]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.createTable("invoices_old", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      orderId: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: "orders", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      invoiceNumber: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      type: {
        type: Sequelize.ENUM("receipt", "r1"),
        allowNull: false,
      },
      sequenceNumber: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      year: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      pdfPath: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      generatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });

    await queryInterface.sequelize.query(
      "INSERT INTO invoices_old SELECT * FROM invoices"
    );

    await queryInterface.dropTable("invoices");
    await queryInterface.renameTable("invoices_old", "invoices");

    await queryInterface.addIndex("invoices", ["orderId"], { unique: true });
    await queryInterface.addIndex("invoices", ["year", "type"]);
  },
};
