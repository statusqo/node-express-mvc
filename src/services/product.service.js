/**
 * Product service - business logic for products.
 * Follows Routes → Controllers → Services → Repos → Models architecture.
 */
const productRepo = require("../repos/product.repo");
const productTypeRepo = require("../repos/productType.repo");
const productCategoryRepo = require("../repos/productCategory.repo");
const taxRateRepo = require("../repos/taxRate.repo");
const metaObjectRepo = require("../repos/metaObject.repo");
const mediaRepo = require("../repos/media.repo");

module.exports = {
  async findAll(options = {}) {
    return await productRepo.findAllWithDefaultVariant(options);
  },

  async findById(id, options = {}) {
    return await productRepo.findById(id, options);
  },

  async findByIdWithFormData(id, options = {}) {
    return await productRepo.findByIdWithFormData(id, options);
  },

  async findByIdWithMetaObjects(id, options = {}) {
    return await productRepo.findByIdWithMetaObjects(id, options);
  },

  async findActiveBySlug(slug, options = {}) {
    return await productRepo.findActiveBySlugWithMeta(slug, options);
  },

  async findActiveBySlugWithType(slug, options = {}) {
    return await productRepo.findActiveBySlugWithType(slug, options);
  },

  async findBySlug(slug, options = {}) {
    return await productRepo.findBySlug(slug, options);
  },

  async findBySlugWithTypeAndDefaultVariant(slug, options = {}) {
    return await productRepo.findBySlugWithTypeAndDefaultVariant(slug, options);
  },

  async findAllByTypeSlug(productTypeSlug, options = {}) {
    return await productRepo.findAllByProductTypeSlug(productTypeSlug, options);
  },

  async getDefaultVariantWithPrice(productId, options = {}) {
    return await productRepo.getDefaultVariantWithPrice(productId, options);
  },

  async getFormData() {
    const [types, categories, taxRates, metaObjects, media] = await Promise.all([
      productTypeRepo.findAll(),
      productCategoryRepo.findAll(),
      taxRateRepo.findAll(),
      metaObjectRepo.findAllForAdmin(),
      mediaRepo.findAllForAdmin(),
    ]);
    return { types, categories, taxRates, metaObjects, media };
  },

  async create(data, options = {}) {
    return await productRepo.create(data, options);
  },

  async update(id, data, options = {}) {
    return await productRepo.update(id, data, options);
  },

  async delete(id, options = {}) {
    return await productRepo.delete(id, options);
  },
};
