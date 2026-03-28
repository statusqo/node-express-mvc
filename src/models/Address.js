const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");
const { ADDRESS_LABEL_LIST, ADDRESS_LABEL } = require("../constants/address");

const Address = sequelize.define("Address", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  label: {
    type: DataTypes.ENUM(...ADDRESS_LABEL_LIST),
    allowNull: false,
    defaultValue: ADDRESS_LABEL.DELIVERY,
  },
  line1: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  line2: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  city: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  state: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  postcode: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  country: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  isDefault: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  timestamps: true,
  tableName: "addresses",
});

module.exports = Address;
