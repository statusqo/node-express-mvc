const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");

const UserGatewayProfile = sequelize.define("UserGatewayProfile", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  gateway: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  externalCustomerId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  timestamps: true,
  tableName: "user_gateway_profiles",
  indexes: [
    { fields: ["userId"] },
    { unique: true, fields: ["userId", "gateway"] },
  ],
});

module.exports = UserGatewayProfile;
