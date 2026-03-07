const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");

const REFUND_REQUEST_STATUSES = ["pending", "approved", "rejected"];

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
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "pending",
    validate: {
      isIn: [REFUND_REQUEST_STATUSES],
    },
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

RefundRequest.STATUSES = REFUND_REQUEST_STATUSES;

module.exports = RefundRequest;
