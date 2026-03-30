const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");
const { DEFAULT_CURRENCY } = require("../config/constants");
const { TRANSACTION_STATUS_LIST, TRANSACTION_STATUS } = require("../constants/transaction");

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
    // should match DEFAULT_CURRENCY
    defaultValue: DEFAULT_CURRENCY,
  },
  status: {
    type: DataTypes.ENUM(...TRANSACTION_STATUS_LIST),
    allowNull: false,
    defaultValue: TRANSACTION_STATUS.PENDING,
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
