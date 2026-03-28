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
  zoomMeetingId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  zoomHostAccountId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
}, {
  timestamps: true,
  tableName: "event_meetings",
  indexes: [
    { unique: true, fields: ["eventId"] },
    { fields: ["zoomMeetingId"] },
  ],
});

module.exports = EventMeeting;
