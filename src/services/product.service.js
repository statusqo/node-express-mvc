/**
 * Product service - business logic for products.
 * Follows Routes → Controllers → Services → Repos → Models architecture.
 */
const { OrderLine, ProductVariant, ProductPrice } = require("../models");
const productRepo = require("../repos/product.repo");
const productTypeRepo = require("../repos/productType.repo");
const productCategoryRepo = require("../repos/productCategory.repo");
const taxRateRepo = require("../repos/taxRate.repo");
const metaObjectRepo = require("../repos/metaObject.repo");
const mediaRepo = require("../repos/media.repo");
const eventRepo = require("../repos/event.repo");
const productVariantRepo = require("../repos/productVariant.repo");
const { validateAddManageableVariant } = require("../validators/productVariantAdmin.schema");

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

  /**
   * Non-default variants for this product that are not tied to an Event (admin Edit Product — Variants section).
   */
  async listManageableExtraVariants(productId, options = {}) {
    const linkedIds = new Set(await eventRepo.listProductVariantIdsLinkedToProduct(productId, options));
    const rows = await ProductVariant.findAll({
      where: { productId, isDefault: false },
      include: [{ model: ProductPrice, as: "ProductPrices", where: { isDefault: true }, required: false }],
      order: [["title", "ASC"]],
      ...options,
    });
    return rows
      .filter((v) => !linkedIds.has(v.id))
      .map((v) => {
        const p = v.get ? v.get({ plain: true }) : v;
        const pr = p.ProductPrices?.[0];
        return {
          id: p.id,
          title: p.title,
          sku: p.sku,
          quantity: p.quantity,
          active: p.active,
          priceAmount: pr != null ? Number(pr.amount) : 0,
        };
      });
  },

  async addManageableProductVariant(productId, body, options = {}) {
    const product = await productRepo.findById(productId, options);
    if (!product) return { ok: false, status: 404, error: "Product not found." };
    const validation = validateAddManageableVariant(body);
    if (!validation.ok) return { ok: false, status: 400, error: validation.error };
    const { title, priceAmount, quantity, sku, active } = validation.data;
    try {
      await productRepo.createVariantWithDefaultPrice(
        productId,
        { title, amount: priceAmount, quantity, sku: sku || null, active },
        options
      );
    } catch (e) {
      if (e && e.code === "SKU_CONFLICT") {
        return { ok: false, status: 400, error: e.message || "SKU already exists for this product." };
      }
      throw e;
    }
    const variants = await this.listManageableExtraVariants(productId, options);
    return { ok: true, variants };
  },

  async removeManageableProductVariant(productId, variantId, options = {}) {
    const variant = await productVariantRepo.findById(variantId, options);
    if (!variant || String(variant.productId) !== String(productId)) {
      return { ok: false, status: 404, error: "Variant not found." };
    }
    if (variant.isDefault) {
      return { ok: false, status: 400, error: "Cannot remove the default variant." };
    }
    const event = await eventRepo.findByProductVariantId(variantId, options);
    if (event) {
      return { ok: false, status: 400, error: "Cannot remove a variant that is linked to an event." };
    }
    const orderCount = await OrderLine.count({ where: { productVariantId: variantId }, ...options });
    if (orderCount > 0) {
      return { ok: false, status: 400, error: "Cannot remove variant: it has been ordered." };
    }
    await productVariantRepo.destroy(variantId, options);
    const variants = await this.listManageableExtraVariants(productId, options);
    return { ok: true, variants };
  },
};
