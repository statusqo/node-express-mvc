const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");

const Transaction = sequelize.define("Transaction", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  orderId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  currency: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "USD",
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "pending",
    validate: {
      isIn: [["pending", "success", "failed", "refunded"]],
    },
  },
  // e.g. "stripe"
  gateway: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  // e.g. Stripe PaymentIntent id (pi_...) — used for webhook idempotency and refunds
  gatewayReference: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  metadata: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  timestamps: true,
  tableName: "transactions",
  indexes: [
    { fields: ["orderId"] },
    { fields: ["gatewayReference"] },
  ],
});

module.exports = Transaction;
