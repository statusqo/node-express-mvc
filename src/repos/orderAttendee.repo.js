const { OrderAttendee } = require("../models");

module.exports = {
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
