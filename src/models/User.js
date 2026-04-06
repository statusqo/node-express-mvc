const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");
const { PERSON_TYPE_LIST, PERSON_TYPE } = require("../constants/user");

// Define User model
// Ensure sequelize is initialized before this is required
if (!sequelize) {
  throw new Error("Sequelize instance is not initialized. Check database configuration.");
}

const User = sequelize.define("User", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  userNumber: {
    type: DataTypes.INTEGER,
    allowNull: true,
    unique: true,
  },
  username: {
    type: DataTypes.STRING,
    allowNull: true, // Must be true for SQLite 'alter' to work on existing tables
    unique: true,
    validate: {
      len: [3, 30],
    },
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
    },
  },
  forename: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  surname: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  mobile: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  passwordHash: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  isAdmin: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  stripeCustomerId: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
  },
  googleId: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
  },
  personType: {
    type: DataTypes.ENUM(...PERSON_TYPE_LIST),
    allowNull: false,
    defaultValue: PERSON_TYPE.PRIVATE,
  },
  companyName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  companyOib: {
    type: DataTypes.STRING(11),
    allowNull: true,
  },
}, {
  timestamps: true,
  tableName: 'users',
  indexes: [
    { fields: ['stripeCustomerId'] },
    { fields: ['googleId'], unique: true },
  ],
});

User.addHook("beforeCreate", async (user, options) => {
  const max = await User.max("userNumber", { transaction: options.transaction });
  user.userNumber = (max || 100000) + 1;
});

module.exports = User;
