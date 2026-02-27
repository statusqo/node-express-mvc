"use strict";

/**
 * Creates refund_requests table for customer refund requests and admin processing.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const ts = {
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    };
    const uuid = { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true };

    await queryInterface.createTable("refund_requests", {
      id: uuid,
      orderId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "orders", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "pending",
      },
      reason: { type: Sequelize.TEXT, allowNull: true },
      requestedByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      processedAt: { type: Sequelize.DATE, allowNull: true },
      processedByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      refundAmount: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
      stripeRefundId: { type: Sequelize.STRING, allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex("refund_requests", ["orderId"]);
    await queryInterface.addIndex("refund_requests", ["status"]);
    await queryInterface.addIndex("refund_requests", ["requestedByUserId"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("refund_requests");
  },
};
