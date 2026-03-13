"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("invoices", {
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

    // indices may already be present if the table definition included unique
    // constraints or if the migration has been applied previously in a
    // different order; check existing indexes before adding.
    const existing = await queryInterface.showIndex("invoices");
    const hasIndex = (name) => existing.some((i) => i.name === name);

    if (!hasIndex("invoices_order_id")) {
      await queryInterface.addIndex("invoices", ["orderId"], { unique: true });
    }
    if (!hasIndex("invoices_year_type")) {
      await queryInterface.addIndex("invoices", ["year", "type"]);
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("invoices");
  },
};
