/**
 * Post service - business logic for blog posts.
 * Follows Routes → Controllers → Services → Repos → Models architecture.
 */
const postRepo = require("../repos/post.repo");

module.exports = {
  async findAll(options = {}) {
    return await postRepo.findAll(options);
  },

  async findPublished(options = {}) {
    return await postRepo.findPublished(options);
  },

  async findById(id, options = {}) {
    return await postRepo.findById(id, options);
  },

  async findBySlug(slug, options = {}) {
    return await postRepo.findBySlug(slug, options);
  },

  async create(data, options = {}) {
    return await postRepo.create(data, options);
  },

  async update(id, data, options = {}) {
    return await postRepo.update(id, data, options);
  },

  async delete(id, options = {}) {
    return await postRepo.delete(id, options);
  },
};
