const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");

const OrderAttendee = sequelize.define("OrderAttendee", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  orderId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  orderLineId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  eventId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  attendeeIndex: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  forename: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  surname: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
}, {
  timestamps: true,
  tableName: "order_attendees",
  indexes: [
    { fields: ["orderId"] },
    { fields: ["orderLineId"] },
    { fields: ["eventId"] },
    { unique: true, fields: ["orderLineId", "attendeeIndex"] },
  ],
});

module.exports = OrderAttendee;
