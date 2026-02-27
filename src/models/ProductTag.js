const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");

const ProductTag = sequelize.define("ProductTag", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  productId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  tagId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
}, {
  timestamps: true,
  tableName: "product_tags",
  indexes: [
    { unique: true, fields: ["productId", "tagId"] },
  ],
});

module.exports = ProductTag;
