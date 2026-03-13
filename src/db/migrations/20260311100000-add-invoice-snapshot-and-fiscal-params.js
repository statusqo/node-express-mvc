"use strict";

/**
 * Add accounting snapshot fields and fiscal parameter fields to invoices.
 *
 * Snapshot fields (written at invoice creation, immutable thereafter):
 *   - total        : gross order total in EUR (VAT-inclusive)
 *   - vatTotal     : total VAT amount extracted from lines
 *   - paymentMethod: FINA payment method code (K=card, G=cash, T=transfer, O=other)
 *
 * Fiscal parameter fields (written when fiscalisation succeeds, nullable until then):
 *   - companyOib  : OIB extracted from the FINA certificate used for ZKI/signing
 *   - premisesId  : Business premises ID (FINA_BUSINESS_PREMISES_ID) used at fiscalisation
 *   - deviceId    : Device ID (FINA_DEVICE_ID) used at fiscalisation
 *   - operatorOib : Operator OIB (FINA_OPERATOR_OIB) used at fiscalisation
 *
 * Existing rows get NULL for all columns (historical invoices pre-date this change).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // ── Accounting snapshot ──────────────────────────────────────────────────
    await queryInterface.addColumn("invoices", "total", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      after: "year",
    });

    await queryInterface.addColumn("invoices", "vatTotal", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      after: "total",
    });

    await queryInterface.addColumn("invoices", "paymentMethod", {
      type: Sequelize.STRING(1),
      allowNull: true,
      after: "vatTotal",
    });

    // ── Fiscal parameters (who signed it and on which device) ────────────────
    await queryInterface.addColumn("invoices", "companyOib", {
      type: Sequelize.STRING(11),
      allowNull: true,
      after: "fiscalizationResponse",
    });

    await queryInterface.addColumn("invoices", "premisesId", {
      type: Sequelize.STRING(20),
      allowNull: true,
      after: "companyOib",
    });

    await queryInterface.addColumn("invoices", "deviceId", {
      type: Sequelize.STRING(20),
      allowNull: true,
      after: "premisesId",
    });

    await queryInterface.addColumn("invoices", "operatorOib", {
      type: Sequelize.STRING(11),
      allowNull: true,
      after: "deviceId",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("invoices", "operatorOib");
    await queryInterface.removeColumn("invoices", "deviceId");
    await queryInterface.removeColumn("invoices", "premisesId");
    await queryInterface.removeColumn("invoices", "companyOib");
    await queryInterface.removeColumn("invoices", "paymentMethod");
    await queryInterface.removeColumn("invoices", "vatTotal");
    await queryInterface.removeColumn("invoices", "total");
  },
};
