const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");

const ProductCategory = sequelize.define("ProductCategory", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  slug: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  // KPD (NKD) classification code required for Croatian Fiscalization 2.0 e-invoices.
  // Format: "62.01.11". Snapshotted to order_lines at order creation time.
  kpdCode: {
    type: DataTypes.STRING(20),
    allowNull: false,
  },
}, {
  timestamps: true,
  tableName: "product_categories",
});

module.exports = ProductCategory;
