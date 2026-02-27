const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");

const Tag = sequelize.define("Tag", {
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
}, {
  timestamps: true,
  tableName: "tags",
});

module.exports = Tag;
