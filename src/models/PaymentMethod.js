const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");

const PaymentMethod = sequelize.define("PaymentMethod", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  gatewayToken: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  gateway: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "stripe",
  },
  last4: {
    type: DataTypes.STRING(4),
    allowNull: true,
  },
  brand: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  expiryMonth: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  expiryYear: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  isDefault: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  timestamps: true,
  tableName: "payment_methods",
  indexes: [{ fields: ["userId"] }],
});

module.exports = PaymentMethod;
