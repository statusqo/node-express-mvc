const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");
const { DISCOUNT_TYPE_LIST, DISCOUNT_APPLIES_TO_LIST } = require("../constants/discount");

const OrderDiscount = sequelize.define("OrderDiscount", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  orderId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  // Nullable so the snapshot survives discount deletion.
  discountId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  // Snapshot fields — reflect the discount state at the moment of order creation.
  code: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  type: {
    type: DataTypes.ENUM(...DISCOUNT_TYPE_LIST),
    allowNull: false,
  },
  value: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  // Actual EUR amount deducted from the order total.
  amountDeducted: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  // Snapshotted at order time — matches discount.applicableTo at redemption.
  applicableTo: {
    type: DataTypes.ENUM(...DISCOUNT_APPLIES_TO_LIST),
    allowNull: false,
    defaultValue: "all",
  },
  // Pre-computed VAT distribution, consumed by stripe.gateway to create
  // correctly VAT-attributed negative InvoiceItems on the Stripe invoice.
  //
  // Shape: Array<{ vatRate: number|null, stripeTaxRateId: string|null, amount: number }>
  //
  // One entry per unique (vatRate, stripeTaxRateId) pair found in the order lines.
  // For non-VAT orders (paušalni): single entry with vatRate=null, stripeTaxRateId=null.
  vatDistribution: {
    type: DataTypes.JSON,
    allowNull: false,
  },
}, {
  timestamps: true,
  tableName: "order_discounts",
  indexes: [
    { fields: ["orderId"] },
  ],
});

module.exports = OrderDiscount;
