const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");
const { REGISTRATION_STATUS_LIST, REGISTRATION_STATUS } = require("../constants/registration");

const Registration = sequelize.define("Registration", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  eventId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  orderId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  orderLineId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: true,
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
  status: {
    type: DataTypes.ENUM(...REGISTRATION_STATUS_LIST),
    allowNull: false,
    defaultValue: REGISTRATION_STATUS.REGISTERED,
  },
  zoomRegistrantId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  timestamps: true,
  tableName: "registrations",
  indexes: [
    { fields: ["eventId"] },
    { fields: ["orderId"] },
    { fields: ["orderLineId"] },
    { unique: true, fields: ["eventId", "orderLineId"] },
  ],
});

module.exports = Registration;
