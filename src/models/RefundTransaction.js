const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");
const { DEFAULT_CURRENCY } = require("../config/constants");
const {
  REFUND_TRANSACTION_STATUS_LIST,
  REFUND_TRANSACTION_SCOPE_LIST,
  REFUND_TRANSACTION_STATUS,
  REFUND_TRANSACTION_SCOPE,
} = require("../constants/refundTransaction");

const RefundTransaction = sequelize.define("RefundTransaction", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  orderId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  refundRequestId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  paymentTransactionId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  stripeRefundId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  paymentIntentId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  currency: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: DEFAULT_CURRENCY,
  },
  status: {
    type: DataTypes.ENUM(...REFUND_TRANSACTION_STATUS_LIST),
    allowNull: false,
    defaultValue: REFUND_TRANSACTION_STATUS.PENDING,
  },
  scopeType: {
    type: DataTypes.ENUM(...REFUND_TRANSACTION_SCOPE_LIST),
    allowNull: false,
    defaultValue: REFUND_TRANSACTION_SCOPE.FULL_ORDER,
  },
  orderLineId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  registrationId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  orderAttendeeId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  refundedQuantity: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  metadata: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  createdByUserId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  processedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  timestamps: true,
  tableName: "refund_transactions",
  indexes: [
    { fields: ["orderId"] },
    { fields: ["status"] },
    { fields: ["stripeRefundId"], unique: true },
    { fields: ["refundRequestId"] },
    { fields: ["paymentTransactionId"] },
    { fields: ["orderLineId"] },
    { fields: ["registrationId"] },
    { fields: ["orderAttendeeId"] },
  ],
});

module.exports = RefundTransaction;
