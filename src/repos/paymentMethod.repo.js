const { PaymentMethod } = require("../models");

module.exports = {
  async findById(id, options = {}) {
    if (!id) return null;
    return await PaymentMethod.findByPk(id, options);
  },

  async findByUser(userId, options = {}) {
    if (!userId) return [];
    return await PaymentMethod.findAll({
      where: { userId },
      ...options,
    });
  },

  async create(data, options = {}) {
    return await PaymentMethod.create(data, options);
  },

  async update(id, data, options = {}) {
    const row = await PaymentMethod.findByPk(id, options);
    if (!row) return null;
    return await row.update(data, options);
  },

  async delete(id, options = {}) {
    const row = await PaymentMethod.findByPk(id, options);
    if (!row) return false;
    await row.destroy(options);
    return true;
  },

  async deleteByUserId(userId, options = {}) {
    if (!userId) return 0;
    const result = await PaymentMethod.destroy({
      where: { userId },
      ...options,
    });
    return result;
  },
};
