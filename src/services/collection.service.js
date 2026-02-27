/**
 * Collection service - business logic for product collections.
 * Follows Routes → Controllers → Services → Repos → Models architecture.
 */
const collectionRepo = require("../repos/collection.repo");
const mediaRepo = require("../repos/media.repo");

function normalizeMediaIds(mediaIds) {
  if (mediaIds == null) return [];
  const arr = Array.isArray(mediaIds) ? mediaIds : [mediaIds];
  return arr.filter((id) => id && String(id).trim());
}

module.exports = {
  async findAllForAdmin(options = {}) {
    return await collectionRepo.findAllForAdmin(options);
  },

  async findAll(options = {}) {
    return await collectionRepo.findAll(options);
  },

  async findById(id, options = {}) {
    return await collectionRepo.findById(id, options);
  },

  async findByIdWithMedia(id, options = {}) {
    return await collectionRepo.findByIdWithMedia(id, options);
  },

  async getFormData() {
    const media = await mediaRepo.findAllForAdmin();
    return { media };
  },

  async findActiveBySlug(slug, options = {}) {
    return await collectionRepo.findActiveBySlug(slug, options);
  },

  async findActiveBySlugWithMedia(slug, options = {}) {
    return await collectionRepo.findActiveBySlugWithMedia(slug, options);
  },

  async getProducts(collectionId, options = {}) {
    return await collectionRepo.getProducts(collectionId, options);
  },

  async create(data, options = {}) {
    const mediaIds = normalizeMediaIds(data.mediaIds);
    return await collectionRepo.create({ ...data, mediaIds }, options);
  },

  async update(id, data, options = {}) {
    const mediaIds = normalizeMediaIds(data.mediaIds);
    return await collectionRepo.update(id, { ...data, mediaIds }, options);
  },

  async delete(id, options = {}) {
    return await collectionRepo.delete(id, options);
  },
};
