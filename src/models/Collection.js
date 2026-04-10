const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");

const Collection = sequelize.define("Collection", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  slug: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  // FK to media. The single image shown in collection listings.
  // Full gallery is loaded via the collection_media join table.
  featuredMediaId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
}, {
  timestamps: true,
  tableName: "collections",
});

module.exports = Collection;
