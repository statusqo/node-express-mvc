/**
 * Product type service - business logic for product types.
 * Follows Routes → Controllers → Services → Repos → Models architecture.
 */
const productTypeRepo = require("../repos/productType.repo");

module.exports = {
  async findAll(options = {}) {
    return await productTypeRepo.findAll(options);
  },

  async findById(id, options = {}) {
    return await productTypeRepo.findById(id, options);
  },

  async findBySlug(slug, options = {}) {
    return await productTypeRepo.findBySlug(slug, options);
  },

  async create(data, options = {}) {
    return await productTypeRepo.create(data, options);
  },

  async update(id, data, options = {}) {
    return await productTypeRepo.update(id, data, options);
  },

  async delete(id, options = {}) {
    return await productTypeRepo.delete(id, options);
  },
};
