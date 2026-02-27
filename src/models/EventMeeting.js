const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");

const EventMeeting = sequelize.define("EventMeeting", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  eventId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  provider: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "zoom",
  },
  providerMeetingId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  // TEXT (not STRING/VARCHAR) — Zoom URLs, especially start_url, contain embedded
  // JWTs (zak tokens) that routinely exceed 255 characters.
  joinUrl: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  startUrl: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  hostAccountId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
}, {
  timestamps: true,
  tableName: "event_meetings",
  indexes: [
    { unique: true, fields: ["eventId"] },
    { fields: ["providerMeetingId"] },
  ],
});

module.exports = EventMeeting;
