const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");
const { DISCOUNT_TYPE_LIST, DISCOUNT_APPLIES_TO_LIST } = require("../constants/discount");

const Discount = sequelize.define("Discount", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  // Always stored uppercase — normalised in discount.repo before insert/update.
  code: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  type: {
    type: DataTypes.ENUM(...DISCOUNT_TYPE_LIST),
    allowNull: false,
  },
  // Percentage (0–100) or fixed EUR amount, depending on type.
  value: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  // Minimum cart total (pre-discount) required to use this code. null = no minimum.
  minOrderAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  // Maximum total redemptions allowed. null = unlimited.
  maxUses: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  // Incremented atomically inside the order transaction on each redemption.
  usedCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  // Inclusive start of valid window. null = no lower bound.
  validFrom: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  // Inclusive end of valid window. null = no upper bound.
  validUntil: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  // Internal admin notes — not exposed to customers.
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  // Controls which order lines the discount is applied to.
  // 'all' (default) → entire order total
  // 'events'        → only event-tied product variant lines
  // 'products'      → only non-event product variant lines
  applicableTo: {
    type: DataTypes.ENUM(...DISCOUNT_APPLIES_TO_LIST),
    allowNull: false,
    defaultValue: "all",
  },
}, {
  timestamps: true,
  tableName: "discounts",
  indexes: [
    { fields: ["code"], unique: true },
  ],
});

module.exports = Discount;
