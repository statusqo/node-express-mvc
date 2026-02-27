const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");

const ProductMedia = sequelize.define("ProductMedia", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  productId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  mediaId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  sortOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  timestamps: true,
  tableName: "product_media",
  indexes: [
    { unique: true, fields: ["productId", "mediaId"] },
  ],
});

module.exports = ProductMedia;
