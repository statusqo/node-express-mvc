const { Collection, Product, ProductCollection, ProductVariant, ProductPrice, Media, CollectionMedia } = require("../models");

function normalizeMediaIds(mediaIds) {
  if (mediaIds == null) return [];
  const arr = Array.isArray(mediaIds) ? mediaIds : [mediaIds];
  return arr.filter((id) => id && String(id).trim());
}

function normalizeFeaturedMediaId(featuredMediaId, mediaIds) {
  if (!featuredMediaId || typeof featuredMediaId !== "string") return null;
  const id = featuredMediaId.trim();
  if (!id) return null;
  return normalizeMediaIds(mediaIds).includes(id) ? id : null;
}

async function syncCollectionMedia(collectionId, mediaIds, options = {}) {
  const ids = normalizeMediaIds(mediaIds);
  const t = options.transaction;

  const existing = await CollectionMedia.findAll({
    where: { collectionId },
    transaction: t,
  });
  const existingByMediaId = new Map(existing.map((r) => [r.mediaId, r]));
  const targetIds = new Set(ids);

  for (let i = 0; i < ids.length; i++) {
    const mediaId = ids[i];
    const row = existingByMediaId.get(mediaId);
    if (row) {
      await row.update({ sortOrder: i }, options);
    } else {
      await CollectionMedia.create(
        { collectionId, mediaId, sortOrder: i },
        options
      );
    }
  }

  for (const row of existing) {
    if (!targetIds.has(row.mediaId)) {
      await row.destroy(options);
    }
  }
}

module.exports = {
  async findAll(options = {}) {
    return await Collection.findAll({ where: { active: true }, ...options });
  },

  async findAllForAdmin(options = {}) {
    return await Collection.findAll(options);
  },

  async findById(id, options = {}) {
    return await Collection.findByPk(id, options);
  },

  async findByIdWithMedia(id, options = {}) {
    return await Collection.findByPk(id, {
      ...options,
      include: [
        { model: Media, as: "media", through: { attributes: ["id", "collectionId", "mediaId", "sortOrder"] }, required: false },
      ],
    });
  },

  async findBySlug(slug, options = {}) {
    return await Collection.findOne({ where: { slug }, ...options });
  },

  async findActiveBySlug(slug, options = {}) {
    return await Collection.findOne({
      where: { slug, active: true },
      ...options,
    });
  },

  async findActiveBySlugWithMedia(slug, options = {}) {
    return await Collection.findOne({
      where: { slug, active: true },
      include: [
        { model: Media, as: "media", through: { attributes: ["sortOrder"] }, required: false },
      ],
      ...options,
    });
  },

  async getProducts(collectionId, options = {}) {
    const collection = await Collection.findByPk(collectionId, {
      include: [
        {
          model: Product,
          as: "products",
          through: { attributes: ["sortOrder"], order: [["sortOrder", "ASC"]] },
          where: { active: true },
          required: false,
          include: [
            {
              model: ProductVariant,
              as: "ProductVariants",
              where: { isDefault: true },
              required: false,
              limit: 1,
              include: [{ model: ProductPrice, as: "ProductPrices", where: { isDefault: true }, required: false, limit: 1 }],
            },
            { model: Media, as: "media", through: { attributes: ["sortOrder"] }, required: false },
          ],
        },
      ],
      ...options,
    });
    return collection ? collection.products || [] : [];
  },

  async create(data, options = {}) {
    const { mediaIds, featuredMediaId: rawFeaturedMediaId, ...rest } = data;
    const featuredMediaId = normalizeFeaturedMediaId(rawFeaturedMediaId, mediaIds);
    const collection = await Collection.create({ ...rest, featuredMediaId: featuredMediaId || null }, options);
    if (mediaIds && mediaIds.length > 0) {
      await syncCollectionMedia(collection.id, mediaIds, options);
    }
    return collection;
  },

  async update(id, data, options = {}) {
    const collection = await Collection.findByPk(id, options);
    if (!collection) return null;
    const { mediaIds, featuredMediaId: rawFeaturedMediaId, ...rest } = data;
    const updateData = { ...rest };
    if (rawFeaturedMediaId !== undefined) {
      if (mediaIds !== undefined) {
        updateData.featuredMediaId = normalizeFeaturedMediaId(rawFeaturedMediaId, mediaIds);
      } else {
        const existingMedia = await CollectionMedia.findAll({ where: { collectionId: id }, ...options });
        updateData.featuredMediaId = normalizeFeaturedMediaId(rawFeaturedMediaId, existingMedia.map((r) => r.mediaId));
      }
    }
    await collection.update(updateData, options);
    if (mediaIds !== undefined) {
      await syncCollectionMedia(id, mediaIds, options);
    }
    return collection;
  },

  async delete(id, options = {}) {
    const collection = await Collection.findByPk(id, options);
    if (!collection) return { deleted: false, error: "Collection not found." };
    try {
      await collection.destroy(options);
      return { deleted: true };
    } catch (err) {
      if (err.name === "SequelizeForeignKeyConstraintError") {
        return { deleted: false, error: "Cannot delete: this collection is referenced by other records." };
      }
      throw err;
    }
  },

  async count(options = {}) {
    return await Collection.count(options);
  },
};
