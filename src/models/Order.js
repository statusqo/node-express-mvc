const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");
const { PAYMENT_STATUSES, FULFILLMENT_STATUSES } = require("../constants/order");
const { DEFAULT_CURRENCY } = require("../config/constants");
const Order = sequelize.define("Order", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  sessionId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  forename: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  surname: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  mobile: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  deliveryLine1: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  deliveryLine2: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  deliveryCity: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  deliveryState: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  deliveryPostcode: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  deliveryCountry: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  billingLine1: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  billingLine2: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  billingCity: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  billingState: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  billingPostcode: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  billingCountry: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  personType: {
    type: DataTypes.ENUM('private', 'legal'),
    allowNull: false,
    defaultValue: 'private',
  },
  companyName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  companyOib: {
    type: DataTypes.STRING(11),
    allowNull: true,
  },
  // Deprecated: use paymentStatus + fulfillmentStatus. Kept for migration compatibility.
  status: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  paymentStatus: {
    type: DataTypes.ENUM(...PAYMENT_STATUSES),
    allowNull: false,
    defaultValue: "paid",
  },
  fulfillmentStatus: {
    type: DataTypes.ENUM(...FULFILLMENT_STATUSES),
    allowNull: false,
    defaultValue: "pending",
  },
  total: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
  },
  currency: {
    type: DataTypes.STRING,
    allowNull: false,
    // must match DEFAULT_CURRENCY constant
    defaultValue: DEFAULT_CURRENCY,
  },
  // Stripe PaymentIntent id — set when creating PaymentIntent (custom checkout) or from Checkout Session (redirect). Used by webhooks to find order.
  stripePaymentIntentId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  timestamps: true,
  tableName: "orders",
  indexes: [
    { fields: ["userId"] },
    { fields: ["sessionId"] },
    { fields: ["paymentStatus"] },
    { fields: ["fulfillmentStatus"] },
    { fields: ["stripePaymentIntentId"] },
  ],
});

module.exports = Order;
