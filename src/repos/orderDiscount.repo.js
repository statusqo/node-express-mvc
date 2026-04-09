const { OrderDiscount, Discount } = require("../models");

module.exports = {
  /**
   * Creates the order discount snapshot. Must be called inside a transaction.
   * @param {object} data    - { orderId, discountId, code, type, value, amountDeducted, vatDistribution }
   * @param {object} options - Should include { transaction }
   */
  async create(data, options = {}) {
    return await OrderDiscount.create(data, options);
  },

  /**
   * Returns the discount snapshot for a given order, including the source
   * Discount record (if it still exists). Used by the Stripe gateway and
   * admin order views.
   */
  async findByOrder(orderId, options = {}) {
    return await OrderDiscount.findOne({
      where: { orderId },
      include: [{ model: Discount, as: "Discount", required: false }],
      ...options,
    });
  },
};
