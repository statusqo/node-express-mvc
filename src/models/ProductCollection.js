const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");

const ProductCollection = sequelize.define("ProductCollection", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  productId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  collectionId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  sortOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  timestamps: true,
  tableName: "product_collections",
  indexes: [
    { unique: true, fields: ["productId", "collectionId"] },
  ],
});

module.exports = ProductCollection;
