const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");
const { encrypt, decrypt } = require("../utils/encrypt");

const AdminZoomAccount = sequelize.define("AdminZoomAccount", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  zoomUserId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  accessToken: {
    type: DataTypes.TEXT,
    allowNull: false,
    get() {
      return decrypt(this.getDataValue("accessToken"));
    },
    set(val) {
      this.setDataValue("accessToken", val != null ? encrypt(String(val)) : val);
    },
  },
  refreshToken: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const raw = this.getDataValue("refreshToken");
      return raw != null ? decrypt(raw) : null;
    },
    set(val) {
      this.setDataValue("refreshToken", val != null ? encrypt(String(val)) : null);
    },
  },
  tokenExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  timestamps: true,
  tableName: "admin_zoom_accounts",
  indexes: [{ unique: true, fields: ["userId"] }, { fields: ["zoomUserId"] }],
});

module.exports = AdminZoomAccount;
