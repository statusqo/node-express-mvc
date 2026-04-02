const { OrderAttendee } = require("../models");

module.exports = {
  async findById(id, options = {}) {
    if (!id) return null;
    return await OrderAttendee.findByPk(id, options);
  },

  async update(id, data, options = {}) {
    const row = await OrderAttendee.findByPk(id, options);
    if (!row) return null;
    return await row.update(data, options);
  },

  async create(data, options = {}) {
    return await OrderAttendee.create(data, options);
  },

  async bulkCreate(rows, options = {}) {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    return await OrderAttendee.bulkCreate(rows, options);
  },

  async findAllByOrderId(orderId, options = {}) {
    if (!orderId) return [];
    return await OrderAttendee.findAll({
      where: { orderId },
      order: [["orderLineId", "ASC"], ["attendeeIndex", "ASC"]],
      ...options,
    });
  },

  async findAllByOrderLineId(orderLineId, options = {}) {
    if (!orderLineId) return [];
    return await OrderAttendee.findAll({
      where: { orderLineId },
      order: [["attendeeIndex", "ASC"]],
      ...options,
    });
  },
};
