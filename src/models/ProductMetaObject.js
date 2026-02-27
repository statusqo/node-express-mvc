const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");

const ProductMetaObject = sequelize.define("ProductMetaObject", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  productId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  metaObjectId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  sortOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  values: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: null,
    get() {
      const raw = this.getDataValue("values");
      if (raw == null || raw === "") return null;
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
    set(val) {
      if (val == null) {
        this.setDataValue("values", null);
        return;
      }
      if (typeof val === "object" && !Array.isArray(val)) {
        this.setDataValue("values", JSON.stringify(val));
      } else {
        this.setDataValue("values", null);
      }
    },
  },
}, {
  timestamps: true,
  tableName: "product_meta_objects",
  indexes: [
    { unique: true, fields: ["productId", "metaObjectId"] },
  ],
});

module.exports = ProductMetaObject;
