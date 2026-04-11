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
    if (!category) return { deleted: false, error: "Product category not found." };
    try {
      await category.destroy(options);
      return { deleted: true };
    } catch (err) {
      if (err.name === "SequelizeForeignKeyConstraintError") {
        return { deleted: false, error: "Cannot delete: this category is assigned to one or more products." };
      }
      throw err;
    }
  },

  async count(options = {}) {
    return await ProductCategory.count(options);
  },
};
