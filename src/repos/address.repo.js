const { Address } = require("../models");

module.exports = {
  async findById(id, options = {}) {
    if (!id) return null;
    return await Address.findByPk(id, options);
  },

  async findByUser(userId, options = {}) {
    if (!userId) return [];
    return await Address.findAll({
      where: { userId },
      ...options,
    });
  },

  async findByUserAndLabel(userId, label, options = {}) {
    if (!userId) return null;
    return await Address.findOne({
      where: { userId, label: label || null },
      ...options,
    });
  },

  async getOrCreateByUserAndLabel(userId, label, defaults = {}, options = {}) {
    let row = await this.findByUserAndLabel(userId, label, options);
    if (!row) row = await this.create({ userId, label, ...defaults }, options);
    return row;
  },

  async create(data, options = {}) {
    return await Address.create(data, options);
  },

  async update(id, data, options = {}) {
    const row = await Address.findByPk(id, options);
    if (!row) return null;
    return await row.update(data, options);
  },

  async delete(id, options = {}) {
    const row = await Address.findByPk(id, options);
    if (!row) return false;
    await row.destroy(options);
    return true;
  },

  async unlinkUser(userId, options = {}) {
    if (!userId) return 0;
    const [affected] = await Address.update(
      { userId: null },
      { where: { userId }, ...options }
    );
    return affected;
  },
};
