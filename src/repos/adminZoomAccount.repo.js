const { AdminZoomAccount } = require("../models");

module.exports = {
  async findByUserId(userId, options = {}) {
    if (!userId) return null;
    return await AdminZoomAccount.findOne({ where: { userId }, ...options });
  },

  async create(data, options = {}) {
    return await AdminZoomAccount.create(data, options);
  },

  async update(id, data, options = {}) {
    const row = await AdminZoomAccount.findByPk(id, options);
    if (!row) return null;
    return await row.update(data, options);
  },
};
