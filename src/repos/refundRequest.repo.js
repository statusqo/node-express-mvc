const { Op } = require("sequelize");
const { RefundRequest } = require("../models");

const PENDING = "pending";

module.exports = {
  async findById(id, options = {}) {
    if (!id) return null;
    return await RefundRequest.findByPk(id, options);
  },

  async findByOrder(orderId, options = {}) {
    if (!orderId) return [];
    return await RefundRequest.findAll({
      where: { orderId },
      order: [["createdAt", "DESC"]],
      ...options,
    });
  },

  async findPendingByOrder(orderId, options = {}) {
    if (!orderId) return null;
    return await RefundRequest.findOne({
      where: { orderId, status: PENDING },
      ...options,
    });
  },

  /**
   * Find all refund requests with status pending (for admin list).
   */
  async findPending(options = {}) {
    return await RefundRequest.findAll({
      where: { status: PENDING },
      order: [["createdAt", "ASC"]],
      ...options,
    });
  },

  /**
   * Find all refund requests with optional status filter (for admin list).
   */
  async findAll(filters = {}, options = {}) {
    const where = {};
    if (filters.status && ["pending", "approved", "rejected"].includes(filters.status)) {
      where.status = filters.status;
    }
    return await RefundRequest.findAll({
      where: Object.keys(where).length ? where : undefined,
      order: [["createdAt", "DESC"]],
      ...options,
    });
  },

  async create(data, options = {}) {
    return await RefundRequest.create(data, options);
  },

  async update(id, data, options = {}) {
    const row = await RefundRequest.findByPk(id, options);
    if (!row) return null;
    return await row.update(data, options);
  },
};
