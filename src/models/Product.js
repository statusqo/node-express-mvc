const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");

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
    type: DataTypes.ENUM("g", "kg"),
    allowNull: true,
  },
  // Croatian PDV (VAT) rate as a percentage integer: 0, 5, 13, or 25.
  // Prices are stored gross (VAT-inclusive). Net = gross / (1 + vatRate/100).
  vatRate: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 25,
  },
}, {
  timestamps: true,
  tableName: "products",
});

module.exports = Product;