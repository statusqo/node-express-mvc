const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");
const { REFUND_REQUEST_STATUS_LIST, REFUND_REQUEST_STATUS } = require("../constants/refundRequest");

const RefundRequest = sequelize.define("RefundRequest", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  orderId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM(...REFUND_REQUEST_STATUS_LIST),
    allowNull: false,
    defaultValue: REFUND_REQUEST_STATUS.PENDING,
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  requestedByUserId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  processedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  processedByUserId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  stripeRefundId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  timestamps: true,
  tableName: "refund_requests",
  indexes: [
    { fields: ["orderId"] },
    { fields: ["status"] },
    { fields: ["requestedByUserId"] },
  ],
});

module.exports = RefundRequest;
