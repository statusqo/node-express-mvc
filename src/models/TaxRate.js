const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");

const TaxRate = sequelize.define("TaxRate", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  // Human-readable label shown in admin, e.g. "PDV 25%"
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  // Stripe Tax Rate object ID, e.g. "txr_1Abc23..."
  // Created manually on the Stripe Dashboard, then entered here.
  stripeTaxRateId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  // VAT percentage as integer (0, 5, 13, 25) — for display purposes only.
  // The actual tax calculation is handled by Stripe using the stripeTaxRateId.
  percentage: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  timestamps: true,
  tableName: "tax_rates",
});

module.exports = TaxRate;
