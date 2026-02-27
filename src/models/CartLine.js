const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");

const CartLine = sequelize.define("CartLine", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  cartId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  productVariantId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  quantity: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
}, {
  timestamps: true,
  tableName: "cart_lines",
  indexes: [
    { unique: true, fields: ["cartId", "productVariantId"] },
  ],
});

module.exports = CartLine;
