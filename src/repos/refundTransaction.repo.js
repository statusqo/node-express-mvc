const { RefundTransaction } = require("../models");
const { Op } = require("sequelize");

module.exports = {
  async create(data, options = {}) {
    return await RefundTransaction.create(data, options);
  },

  async findById(id, options = {}) {
    if (!id) return null;
    return await RefundTransaction.findByPk(id, options);
  },

  async findByStripeRefundId(stripeRefundId, options = {}) {
    if (!stripeRefundId) return null;
    return await RefundTransaction.findOne({ where: { stripeRefundId }, ...options });
  },

  async findAllByOrderId(orderId, options = {}) {
    if (!orderId) return [];
    return await RefundTransaction.findAll({
      where: { orderId },
      order: [["createdAt", "DESC"]],
      ...options,
    });
  },

  async findAllSucceededByOrderId(orderId, options = {}) {
    if (!orderId) return [];
    return await RefundTransaction.findAll({
      where: { orderId, status: "succeeded" },
      order: [["createdAt", "DESC"]],
      ...options,
    });
  },

  async findPendingByStripeRefundIds(refundIds, options = {}) {
    if (!Array.isArray(refundIds) || refundIds.length === 0) return [];
    return await RefundTransaction.findAll({
      where: {
        stripeRefundId: { [Op.in]: refundIds },
      },
      ...options,
    });
  },

  async update(id, data, options = {}) {
    const row = await RefundTransaction.findByPk(id, options);
    if (!row) return null;
    return await row.update(data, options);
  },
};
