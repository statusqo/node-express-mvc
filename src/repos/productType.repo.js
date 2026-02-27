const { ProductType } = require("../models");

module.exports = {
  async findAll(options = {}) {
    return await ProductType.findAll(options);
  },

  async findById(id, options = {}) {
    return await ProductType.findByPk(id, options);
  },

  async findBySlug(slug, options = {}) {
    return await ProductType.findOne({ where: { slug }, ...options });
  },

  async create(data, options = {}) {
    return await ProductType.create(data, options);
  },

  async update(id, data, options = {}) {
    const row = await ProductType.findByPk(id, options);
    if (!row) return null;
    return await row.update(data, options);
  },

  async delete(id, options = {}) {
    const row = await ProductType.findByPk(id, options);
    if (!row) return false;
    await row.destroy(options);
    return true;
  },

  async count(options = {}) {
    return await ProductType.count(options);
  },
};
