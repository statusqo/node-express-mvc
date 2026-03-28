const { ProductCategory } = require("../models");

module.exports = {
  async findAll(options = {}) {
    return await ProductCategory.findAll(options);
  },

  async findById(id, options = {}) {
    return await ProductCategory.findByPk(id, options);
  },

  async findBySlug(slug, options = {}) {
    return await ProductCategory.findOne({ where: { slug }, ...options });
  },

  async create(data, options = {}) {
    return await ProductCategory.create(data, options);
  },

  async update(id, data, options = {}) {
    const category = await ProductCategory.findByPk(id, options);
    if (!category) return null;
    return await category.update(data, options);
  },

  async delete(id, options = {}) {
    const category = await ProductCategory.findByPk(id, options);
    if (!category) return false;
    await category.destroy(options);
    return true;
  },

  async count(options = {}) {
    return await ProductCategory.count(options);
  },
};
