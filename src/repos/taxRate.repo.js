const { TaxRate, Product } = require("../models");

module.exports = {
  async findAll(options = {}) {
    return await TaxRate.findAll({ order: [["percentage", "ASC"]], ...options });
  },

  async findById(id, options = {}) {
    return await TaxRate.findByPk(id, options);
  },

  async findByStripeId(stripeTaxRateId, options = {}) {
    return await TaxRate.findOne({ where: { stripeTaxRateId }, ...options });
  },

  async create(data, options = {}) {
    return await TaxRate.create(data, options);
  },

  async update(id, data, options = {}) {
    const record = await TaxRate.findByPk(id, options);
    if (!record) return null;
    return await record.update(data, options);
  },

  async delete(id, options = {}) {
    const record = await TaxRate.findByPk(id, options);
    if (!record) return { deleted: false, error: "Tax rate not found." };
    const productCount = await Product.count({ where: { taxRateId: id }, ...options });
    if (productCount > 0) {
      return { deleted: false, error: "Cannot delete: this tax rate is in use by one or more products." };
    }
    await record.destroy(options);
    return { deleted: true };
  },
};
