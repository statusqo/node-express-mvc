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
    if (!row) return { deleted: false, error: "Product type not found." };
    try {
      await row.destroy(options);
      return { deleted: true };
    } catch (err) {
      if (err.name === "SequelizeForeignKeyConstraintError") {
        return { deleted: false, error: "Cannot delete: this product type is assigned to one or more products." };
      }
      throw err;
    }
  },

  async count(options = {}) {
    return await ProductType.count(options);
  },
};
