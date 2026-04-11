const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");
const { ORDER_HISTORY_EVENT_LIST } = require("../constants/orderHistory");

const OrderHistory = sequelize.define(
  "OrderHistory",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    orderId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    event: {
      type: DataTypes.ENUM(...ORDER_HISTORY_EVENT_LIST),
      allowNull: false,
    },
    // true = succeeded, false = failed, null = informational
    success: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    // Free-form JSON context: error messages, changed fields, Stripe IDs, counts, etc.
    meta: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    // Admin user who triggered this (null = system)
    actorId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    tableName: "order_histories",
    // Append-only: Sequelize auto-sets createdAt; no updatedAt column exists.
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ["orderId"] },
      { fields: ["event"] },
      { fields: ["createdAt"] },
    ],
  }
);

module.exports = OrderHistory;
