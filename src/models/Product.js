const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");
const { UNIT_OF_MEASURE_LIST, WEIGHT_UNIT_LIST } = require("../constants/product");

const Product = sequelize.define("Product", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  slug: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  productTypeId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  productCategoryId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  taxRateId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  isPhysical: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  },
  weight: {
    type: DataTypes.DECIMAL(10, 3),
    allowNull: true,
  },
  weightUnit: {
    type: DataTypes.ENUM(...WEIGHT_UNIT_LIST),
    allowNull: true,
  },
  // Unit of measure for Croatian invoice line items. Snapshotted to order_lines at order time.
  unitOfMeasure: {
    type: DataTypes.ENUM(...UNIT_OF_MEASURE_LIST),
    allowNull: false,
  },
}, {
  timestamps: true,
  tableName: "products",
});

module.exports = Product;