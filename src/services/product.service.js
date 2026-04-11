/**
 * Product service - business logic for products.
 * Follows Routes → Controllers → Services → Repos → Models architecture.
 */
const { OrderLine, ProductVariant, ProductPrice } = require("../models");
const { sequelize } = require("../db");
const productRepo = require("../repos/product.repo");
const productTypeRepo = require("../repos/productType.repo");
const productCategoryRepo = require("../repos/productCategory.repo");
const taxRateRepo = require("../repos/taxRate.repo");
const metaObjectRepo = require("../repos/metaObject.repo");
const mediaRepo = require("../repos/media.repo");
const eventRepo = require("../repos/event.repo");
const productVariantRepo = require("../repos/productVariant.repo");
const cartService = require("./cart.service");

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

  async findActiveBySlugWithTypeAndCategory(slug, options = {}) {
    return await productRepo.findActiveBySlugWithTypeAndCategory(slug, options);
  },

  async findBySlug(slug, options = {}) {
    return await productRepo.findBySlug(slug, options);
  },

  async findBySlugWithTypeAndCategoryAndDefaultVariant(slug, options = {}) {
    return await productRepo.findBySlugWithTypeAndCategoryAndDefaultVariant(slug, options);
  },

  async findAllByTypeSlug(productTypeSlug, options = {}) {
    return await productRepo.findAllByProductTypeSlug(productTypeSlug, options);
  },

  async findAllByCategorySlug(categorySlug, options = {}) {
    return await productRepo.findAllByProductCategorySlug(categorySlug, options);
  },

  async getDefaultVariantWithPrice(productId, options = {}) {
    return await productRepo.getDefaultVariantWithPrice(productId, options);
  },

  async getVariantPriceRangesByProductIds(productIds, options = {}) {
    return await productVariantRepo.getVariantPriceRangesByProductIds(productIds, options);
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
    const { variants, ...productData } = data;
    const t = options.transaction || (await sequelize.transaction());
    const ownTransaction = !options.transaction;
    try {
      const product = await productRepo.create(productData, { ...options, transaction: t });
      if (variants && variants.length > 0) {
        await this.syncManageableVariants(product.id, variants, { transaction: t });
      }
      if (ownTransaction) await t.commit();
      return product;
    } catch (e) {
      if (ownTransaction) await t.rollback();
      throw e;
    }
  },

  async update(id, data, options = {}) {
    const { variants, ...productData } = data;
    const t = options.transaction || (await sequelize.transaction());
    const ownTransaction = !options.transaction;
    try {
      const product = await productRepo.update(id, productData, { ...options, transaction: t });
      await this.syncManageableVariants(id, variants || [], { transaction: t });
      if (ownTransaction) await t.commit();
      return product;
    } catch (e) {
      if (ownTransaction) await t.rollback();
      throw e;
    }
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

  /**
   * Sync manageable (non-default, non-event-linked) variants for a product against a submitted list.
   * - Existing variants whose ID is absent from the submitted list are deleted (blocked if ordered).
   * - Submitted entries without an ID are created as new variants.
   * Must be called within a transaction for atomicity.
   */
  async syncManageableVariants(productId, submittedVariants, options = {}) {
    const existing = await this.listManageableExtraVariants(productId, options);
    const existingIds = new Set(existing.map((v) => v.id));

    const submittedIds = new Set(
      (submittedVariants || []).map((v) => v.id).filter(Boolean)
    );

    // Delete existing variants not present in the submitted list
    for (const v of existing) {
      if (!submittedIds.has(v.id)) {
        const orderCount = await OrderLine.count({ where: { productVariantId: v.id }, ...options });
        if (orderCount > 0) {
          const err = new Error(`Cannot remove variant "${v.title}": it has been ordered and cannot be deleted.`);
          err.status = 400;
          throw err;
        }
        await cartService.removeVariantFromAllCarts(v.id, options);
        await productVariantRepo.destroyPrices(v.id, options);
        await productVariantRepo.destroy(v.id, options);
      }
    }

    // Update existing variants whose ID is in both sets
    for (const v of (submittedVariants || [])) {
      if (v.id && existingIds.has(v.id)) {
        await productVariantRepo.update(v.id, {
          title: v.title,
          quantity: v.quantity,
          sku: v.sku || null,
          active: v.active,
        }, options);
        await productVariantRepo.updateDefaultPrice(v.id, { amount: v.priceAmount }, options);
      }
    }

    // Create variants that have no ID (new) or an ID not in the current existing set
    for (const v of (submittedVariants || [])) {
      if (!v.id || !existingIds.has(v.id)) {
        await productRepo.createVariantWithDefaultPrice(
          productId,
          { title: v.title, amount: v.priceAmount, quantity: v.quantity, sku: v.sku || null, active: v.active },
          options
        );
      }
    }
  },
};
