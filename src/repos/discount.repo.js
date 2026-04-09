const { Discount } = require("../models");
const { Op } = require("sequelize");

module.exports = {
  async findAll(options = {}) {
    return await Discount.findAll({ order: [["createdAt", "DESC"]], ...options });
  },

  async findById(id, options = {}) {
    return await Discount.findByPk(id, options);
  },

  /**
   * Case-insensitive code lookup. Codes are always stored uppercase,
   * so we normalise the input before querying.
   */
  async findByCode(code, options = {}) {
    if (!code) return null;
    return await Discount.findOne({
      where: { code: String(code).trim().toUpperCase() },
      ...options,
    });
  },

  async create(data, options = {}) {
    const payload = { ...data, code: String(data.code).trim().toUpperCase() };
    return await Discount.create(payload, options);
  },

  async update(id, data, options = {}) {
    const record = await Discount.findByPk(id, options);
    if (!record) return null;
    const payload = { ...data };
    if (payload.code != null) {
      payload.code = String(payload.code).trim().toUpperCase();
    }
    return await record.update(payload, options);
  },

  /**
   * Prevents deletion of codes that have already been redeemed —
   * those redemptions are referenced by orders and must remain auditable.
   */
  async delete(id, options = {}) {
    const record = await Discount.findByPk(id, options);
    if (!record) return { deleted: false, error: "Discount not found." };
    if (record.usedCount > 0) {
      return {
        deleted: false,
        error: `Cannot delete: this discount has been used ${record.usedCount} time(s). Deactivate it instead.`,
      };
    }
    await record.destroy(options);
    return { deleted: true };
  },

  /**
   * Atomically increments usedCount using a SQL-level UPDATE to prevent
   * over-counting under concurrent checkouts. Must be called inside a transaction.
   *
   * @param {string} id      - Discount UUID
   * @param {object} options - Must include { transaction }
   */
  async incrementUsedCount(id, options = {}) {
    await Discount.increment("usedCount", { by: 1, where: { id }, ...options });
  },

  /**
   * Returns true if a different discount already uses this code.
   * Used for uniqueness validation in the admin controller.
   */
  async isCodeTaken(code, excludeId = null, options = {}) {
    const normalised = String(code).trim().toUpperCase();
    const where = { code: normalised };
    if (excludeId) where.id = { [Op.ne]: excludeId };
    const count = await Discount.count({ where, ...options });
    return count > 0;
  },
};
