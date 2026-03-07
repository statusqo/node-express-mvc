const { Event } = require("../models");
const { EVENT_STATUS } = require("../constants/event");

module.exports = {
  async findById(id, options = {}) {
    return await Event.findByPk(id, options);
  },

  async findByProductId(productId, options = {}) {
    const { where: extraWhere, ...rest } = options;
    return await Event.findAll({
      where: { productId, ...extraWhere },
      order: [
        ["startDate", "ASC"],
        ["startTime", "ASC"],
      ],
      ...rest,
    });
  },

  /**
   * Events with eventStatus = active only (for storefront).
   */
  async findActiveByProductId(productId, options = {}) {
    const { where: extraWhere, ...rest } = options;
    return await Event.findAll({
      where: { productId, eventStatus: EVENT_STATUS.ACTIVE, ...extraWhere },
      order: [
        ["startDate", "ASC"],
        ["startTime", "ASC"],
      ],
      ...rest,
    });
  },

  async findByProductVariantId(productVariantId, options = {}) {
    return await Event.findOne({
      where: { productVariantId },
      ...options,
    });
  },

  async create(data, options = {}) {
    return await Event.create(data, options);
  },

  async update(id, data, options = {}) {
    const row = await Event.findByPk(id, options);
    if (!row) return null;
    return await row.update(data, options);
  },

  async delete(id, options = {}) {
    const row = await Event.findByPk(id, options);
    if (!row) return false;
    await row.destroy(options);
    return true;
  },
};
