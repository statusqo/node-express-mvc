"use strict";

/**
 * Add fiscalisation fields to invoices table.
 *
 * - fiscalInvoiceNumber : Croatian fiscal format "SEQ/PREMISES/DEVICE"
 * - zkiCode             : Issuer protection code (ZKI) — 32-char hex MD5 of signed data
 * - fiscalizationStatus : pending | fiscalized | failed | not_required
 * - fiscalizationJir    : UUID returned by Tax Administration (null until fiscalised)
 * - fiscalizedAt        : Timestamp when JIR was received
 * - fiscalizationRequest  : Full XML sent to Tax Administration (audit trail)
 * - fiscalizationResponse : Full XML response received (audit trail)
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("invoices", "fiscalInvoiceNumber", {
      type: Sequelize.STRING,
      allowNull: true,
      after: "invoiceNumber",
    });

    await queryInterface.addColumn("invoices", "zkiCode", {
      type: Sequelize.STRING(32),
      allowNull: true,
      after: "fiscalInvoiceNumber",
    });

    await queryInterface.addColumn("invoices", "fiscalizationStatus", {
      type: Sequelize.ENUM("pending", "fiscalized", "failed", "not_required"),
      allowNull: false,
      defaultValue: "pending",
      after: "zkiCode",
    });

    await queryInterface.addColumn("invoices", "fiscalizationJir", {
      type: Sequelize.STRING(36),
      allowNull: true,
      after: "fiscalizationStatus",
    });

    await queryInterface.addColumn("invoices", "fiscalizedAt", {
      type: Sequelize.DATE,
      allowNull: true,
      after: "fiscalizationJir",
    });

    await queryInterface.addColumn("invoices", "fiscalizationRequest", {
      type: Sequelize.TEXT,
      allowNull: true,
      after: "fiscalizedAt",
    });

    await queryInterface.addColumn("invoices", "fiscalizationResponse", {
      type: Sequelize.TEXT,
      allowNull: true,
      after: "fiscalizationRequest",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("invoices", "fiscalizationResponse");
    await queryInterface.removeColumn("invoices", "fiscalizationRequest");
    await queryInterface.removeColumn("invoices", "fiscalizedAt");
    await queryInterface.removeColumn("invoices", "fiscalizationJir");
    await queryInterface.removeColumn("invoices", "fiscalizationStatus");
    await queryInterface.removeColumn("invoices", "zkiCode");
    await queryInterface.removeColumn("invoices", "fiscalInvoiceNumber");
  },
};
