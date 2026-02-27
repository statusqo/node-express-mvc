const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");

const Cart = sequelize.define("Cart", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  sessionId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  timestamps: true,
  tableName: "carts",
  indexes: [
    { fields: ["userId"] },
    { fields: ["sessionId"] },
  ],
});

module.exports = Cart;
