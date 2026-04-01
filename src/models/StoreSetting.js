const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");

const StoreSetting = sequelize.define(
  "StoreSetting",
  {
    key: {
      type: DataTypes.STRING(190),
      primaryKey: true,
      allowNull: false,
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "store_settings",
    timestamps: true,
  }
);

module.exports = StoreSetting;
