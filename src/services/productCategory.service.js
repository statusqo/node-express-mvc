const productCategoryRepo = require("../repos/productCategory.repo");

module.exports = {
  async findAll(options = {}) {
    return await productCategoryRepo.findAll({ order: [["name", "ASC"]], ...options });
  },

  async findById(id, options = {}) {
    return await productCategoryRepo.findById(id, options);
  },

  async findBySlug(slug, options = {}) {
    return await productCategoryRepo.findBySlug(slug, options);
  },

  async create(data, options = {}) {
    return await productCategoryRepo.create(data, options);
  },

  async update(id, data, options = {}) {
    return await productCategoryRepo.update(id, data, options);
  },

  async delete(id, options = {}) {
    return await productCategoryRepo.delete(id, options);
  },
};
