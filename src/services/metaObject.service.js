/**
 * Meta object service - business logic for meta objects (custom attributes).
 * Follows Routes → Controllers → Services → Repos → Models architecture.
 */
const metaObjectRepo = require("../repos/metaObject.repo");

module.exports = {
  async findAllForAdmin(options = {}) {
    return await metaObjectRepo.findAllForAdmin(options);
  },

  async findById(id, options = {}) {
    return await metaObjectRepo.findById(id, options);
  },

  async create(data, options = {}) {
    return await metaObjectRepo.create(data, options);
  },

  async update(id, data, options = {}) {
    return await metaObjectRepo.update(id, data, options);
  },

  async delete(id, options = {}) {
    return await metaObjectRepo.delete(id, options);
  },
};
