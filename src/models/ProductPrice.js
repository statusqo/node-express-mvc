const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");
const { DEFAULT_CURRENCY } = require("../config/constants");

const ProductPrice = sequelize.define("ProductPrice", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  productVariantId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    // must always match DEFAULT_CURRENCY constant; admin UI doesn't allow changing it
    defaultValue: DEFAULT_CURRENCY,
  },
  isDefault: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  timestamps: true,
  tableName: "product_prices",
});

module.exports = ProductPrice;
