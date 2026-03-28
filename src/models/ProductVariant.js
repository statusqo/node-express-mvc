const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");

const ProductVariant = sequelize.define("ProductVariant", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  productId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "Default",
  },
  sku: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  isDefault: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
}, {
  timestamps: true,
  tableName: "product_variants",
});

module.exports = ProductVariant;
