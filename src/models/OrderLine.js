const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");

const OrderLine = sequelize.define("OrderLine", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  orderId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  productVariantId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  quantity: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
  eventId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  // Snapshotted VAT rate (%) from the product at order time. Null for pre-fiscalisation orders.
  vatRate: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null,
  },
  // Snapshotted from ProductVariant.sku at order time. Used in Stripe metadata for e-racuni sync.
  sku: {
    type: DataTypes.STRING(255),
    allowNull: true,
    defaultValue: null,
  },
  // Snapshotted from ProductCategory.kpdCode at order time. Required for Fiscalization 2.0.
  kpd: {
    type: DataTypes.STRING(20),
    allowNull: true,
    defaultValue: null,
  },
  // Snapshotted from Product.unitOfMeasure at order time (e.g. "kom", "h", "mj").
  unit: {
    type: DataTypes.STRING(20),
    allowNull: true,
    defaultValue: null,
  },
  // Snapshotted from Product.TaxRate.stripeTaxRateId at order time (e.g. "txr_xxx").
  // Attached to Stripe InvoiceItems so e-racuni.hr reads VAT natively via Stripe tax_rates.
  stripeTaxRateId: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null,
  },
}, {
  timestamps: true,
  tableName: "order_lines",
  indexes: [{ fields: ["orderId"] }, { fields: ["eventId"] }],
});

module.exports = OrderLine;
