const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");

const MenuItem = sequelize.define("MenuItem", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  menuId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  label: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  url: {
    type: DataTypes.STRING(2048),
    allowNull: false,
  },
  order: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  parentId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  icon: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  target: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  method: {
    type: DataTypes.STRING(10),
    allowNull: true,
    defaultValue: "GET",
  },
  slug: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  cssClass: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  timestamps: true,
  tableName: "menu_items",
  validate: {
    orderNonNegative() {
      if (this.order != null && this.order < 0) {
        throw new Error("Order must be >= 0");
      }
    },
  },
});

module.exports = MenuItem;
