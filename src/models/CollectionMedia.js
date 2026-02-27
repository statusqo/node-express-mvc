const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");

const CollectionMedia = sequelize.define("CollectionMedia", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  collectionId: {
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
  tableName: "collection_media",
  indexes: [
    { unique: true, fields: ["collectionId", "mediaId"] },
  ],
});

module.exports = CollectionMedia;
