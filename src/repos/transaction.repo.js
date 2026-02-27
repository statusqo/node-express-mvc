const { Transaction } = require("../models");

module.exports = {
  async findById(id, options = {}) {
    if (!id) return null;
    return await Transaction.findByPk(id, options);
  },

  async findByOrder(orderId, options = {}) {
    if (!orderId) return [];
    return await Transaction.findAll({
      where: { orderId },
      order: [["createdAt", "DESC"]],
      ...options,
    });
  },

  async create(data, options = {}) {
    return await Transaction.create(data, options);
  },

  async update(id, data, options = {}) {
    const row = await Transaction.findByPk(id, options);
    if (!row) return null;
    return await row.update(data, options);
  },
};
