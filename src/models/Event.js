const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");

const Event = sequelize.define("Event", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  productId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  productVariantId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  startDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  startTime: {
    type: DataTypes.TIME,
    allowNull: true,
  },
  durationMinutes: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: "Duration of the event in minutes",
  },
  location: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  capacity: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  isOnline: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  timezone: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: "IANA timezone for startDate/startTime (e.g. Europe/London)",
  },
  eventStatus: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "active",
    comment: "active | cancelled | orphaned",
  },
}, {
  timestamps: true,
  tableName: "events",
});

module.exports = Event;
