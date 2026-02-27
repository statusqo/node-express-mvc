const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");

const Shipping = sequelize.define("Shipping", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  orderId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  addressId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  carrier: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  trackingNumber: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "pending",
    validate: {
      isIn: [["pending", "dispatched", "delivered"]],
    },
  },
  shippedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  deliveredAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  timestamps: true,
  tableName: "shippings",
  indexes: [{ fields: ["orderId"] }],
});

module.exports = Shipping;
