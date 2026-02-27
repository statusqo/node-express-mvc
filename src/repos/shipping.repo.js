const { Shipping } = require("../models");

module.exports = {
  async findById(id, options = {}) {
    if (!id) return null;
    return await Shipping.findByPk(id, options);
  },

  async findByOrder(orderId, options = {}) {
    if (!orderId) return [];
    return await Shipping.findAll({
      where: { orderId },
      ...options,
    });
  },

  async create(data, options = {}) {
    return await Shipping.create(data, options);
  },

  async update(id, data, options = {}) {
    const row = await Shipping.findByPk(id, options);
    if (!row) return null;
    return await row.update(data, options);
  },
};
