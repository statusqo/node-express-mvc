const { OrderLine } = require("../models");

module.exports = {
  async findById(id, options = {}) {
    if (!id) return null;
    return await OrderLine.findByPk(id, options);
  },

  async findByOrder(orderId, options = {}) {
    if (!orderId) return [];
    return await OrderLine.findAll({
      where: { orderId },
      ...options,
    });
  },

  async create(data, options = {}) {
    return await OrderLine.create(data, options);
  },

  /** Count order lines for given product variant IDs (e.g. to guard deletes). */
  async countByProductVariantIds(variantIds, options = {}) {
    if (!variantIds || variantIds.length === 0) return 0;
    return await OrderLine.count({
      where: { productVariantId: variantIds },
      ...options,
    });
  },

  /** Count order lines directly linked to an event (e.g. to guard event deletes). */
  async countByEventId(eventId, options = {}) {
    if (!eventId) return 0;
    return await OrderLine.count({
      where: { eventId },
      ...options,
    });
  },
};
