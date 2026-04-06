const { Product, ProductVariant, ProductPrice, ProductType, ProductCategory, TaxRate, MetaObject, ProductMetaObject, Media, ProductMedia, OrderLine } = require("../models");
const { DEFAULT_CURRENCY } = require("../config/constants");
const { WEIGHT_UNIT } = require("../constants/product");
const productTypeRepo = require("./productType.repo");
const productCategoryRepo = require("./productCategory.repo");
const { sequelize } = require("../db");
const { generateVariantSku } = require("../utils/skuGenerator");

function normalizeMetaObjectIds(metaObjectIds) {
  if (metaObjectIds == null) return [];
  const arr = Array.isArray(metaObjectIds) ? metaObjectIds : [metaObjectIds];
  return arr.filter((id) => id && String(id).trim());
}

/** Default through attributes when loading product with meta objects (includes values for instance editing/display). */
const META_OBJECTS_THROUGH_ATTRIBUTES = ["id", "productId", "metaObjectId", "sortOrder", "values"];

/** Include for list views: default variant with price, media (for customer-facing thumbnails). */
const DEFAULT_VARIANT_INCLUDE = [
  { model: ProductVariant, as: "ProductVariants", where: { isDefault: true }, required: false, limit: 1, include: [{ model: ProductPrice, as: "ProductPrices", where: { isDefault: true }, required: false, limit: 1 }] },
  { model: ProductType, as: "ProductType", attributes: ["id", "name", "slug"], required: false },
  { model: ProductCategory, as: "ProductCategory", attributes: ["id", "name", "slug"], required: false },
  { model: Media, as: "media", through: { attributes: ["sortOrder"] }, required: false },
];

/** Include for admin edit: default variant with price, ProductType, TaxRate, MetaObjects, Media. */
const EDIT_FORM_INCLUDE = [
  { model: ProductVariant, as: "ProductVariants", where: { isDefault: true }, required: false, limit: 1, include: [{ model: ProductPrice, as: "ProductPrices", where: { isDefault: true }, required: false, limit: 1 }] },
  { model: ProductType, as: "ProductType", attributes: ["id", "name", "slug"], required: false },
  { model: TaxRate, as: "TaxRate", attributes: ["id", "name", "stripeTaxRateId", "percentage"], required: false },
  { model: MetaObject, as: "metaObjects", through: { attributes: ["id", "productId", "metaObjectId", "sortOrder", "values"] }, required: false },
  { model: Media, as: "media", through: { attributes: ["id", "productId", "mediaId", "sortOrder"] }, required: false },
];

/** Include for web product show: default variant with price, meta objects, media. */
const SHOW_INCLUDE = [
  { model: ProductVariant, as: "ProductVariants", where: { isDefault: true, active: true }, required: false, limit: 1, include: [{ model: ProductPrice, as: "ProductPrices", where: { isDefault: true }, required: false, limit: 1 }] },
  { model: MetaObject, as: "metaObjects", through: { attributes: ["id", "productId", "metaObjectId", "sortOrder", "values"] }, where: { active: true }, required: false },
  { model: Media, as: "media", through: { attributes: ["sortOrder"] }, required: false },
];

/**
 * Sync product-meta object associations with optional instance values.
 * Creates/updates ProductMetaObject rows for each metaObjectId; removes rows for meta objects no longer linked.
 * When a meta object's definition changes (keys added/removed), unknown keys in metaObjectValues are stripped
 * on save (validation ensures only keys from MetaObject.definition are stored). Existing stored values with
 * stale keys are displayed as-is on read; they are not automatically removed until the product is re-saved.
 * @param {string} productId - Product UUID
 * @param {string[]} metaObjectIds - Array of meta object IDs to link
 * @param {Record<string, Record<string, string>>} [metaObjectValues] - Optional values per metaObjectId
 * @param {object} [options] - Sequelize options (transaction, etc.)
 */
async function syncProductMetaObjects(productId, metaObjectIds, metaObjectValues, options = {}) {
  const ids = normalizeMetaObjectIds(metaObjectIds);
  const t = options.transaction;

  const existing = await ProductMetaObject.findAll({
    where: { productId },
    transaction: t,
  });

  const existingByMetaId = new Map(existing.map((r) => [r.metaObjectId, r]));
  const targetIds = new Set(ids);

  for (let i = 0; i < ids.length; i++) {
    const metaObjectId = ids[i];
    const values = metaObjectValues && metaObjectValues[metaObjectId] && Object.keys(metaObjectValues[metaObjectId]).length > 0
      ? metaObjectValues[metaObjectId]
      : null;
    const row = existingByMetaId.get(metaObjectId);
    if (row) {
      await row.update({ sortOrder: i, values }, options);
    } else {
      await ProductMetaObject.create(
        { productId, metaObjectId, sortOrder: i, values },
        options
      );
    }
  }

  for (const row of existing) {
    if (!targetIds.has(row.metaObjectId)) {
      await row.destroy(options);
    }
  }
}

function normalizeMediaIds(mediaIds) {
  if (mediaIds == null) return [];
  const arr = Array.isArray(mediaIds) ? mediaIds : [mediaIds];
  return arr.filter((id) => id && String(id).trim());
}

async function syncProductMedia(productId, mediaIds, options = {}) {
  const ids = normalizeMediaIds(mediaIds);
  const t = options.transaction;

  const existing = await ProductMedia.findAll({
    where: { productId },
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
      await ProductMedia.create(
        { productId, mediaId, sortOrder: i },
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
    const defaultInclude = [
      { model: ProductType, as: "ProductType", attributes: ["id", "name", "slug"], required: false },
      { model: ProductCategory, as: "ProductCategory", attributes: ["id", "name", "slug"], required: false },
      { model: ProductVariant, as: "ProductVariants", where: { isDefault: true }, required: false, limit: 1 },
    ];
    return await Product.findAll({
      ...options,
      include: options.include || defaultInclude,
    });
  },

  async findAllWithDefaultVariant(options = {}) {
    return await Product.findAll({
      ...options,
      include: options.include || DEFAULT_VARIANT_INCLUDE,
    });
  },

  async findByIdWithFormData(id, options = {}) {
    return await Product.findByPk(id, {
      ...options,
      include: options.include || EDIT_FORM_INCLUDE,
    });
  },

  async findActiveBySlugWithMeta(slug, options = {}) {
    return await Product.findOne({
      where: { slug, active: true },
      ...options,
      include: options.include || SHOW_INCLUDE,
    });
  },

  async findById(id, options = {}) {
    return await Product.findByPk(id, options);
  },

  async findByIdWithMetaObjects(id, options = {}) {
    const metaInclude = [
      { model: MetaObject, as: "metaObjects", through: { attributes: ["id", "productId", "metaObjectId", "sortOrder", "values"] }, required: false },
    ];
    return await Product.findByPk(id, {
      ...options,
      include: options.include || metaInclude,
    });
  },

  async findBySlug(slug, options = {}) {
    return await Product.findOne({
      where: { slug },
      ...options,
    });
  },

  /**
   * Find product by slug with ProductType, ProductCategory, and default variant + price (for admin event-type pages).
   */
  async findBySlugWithTypeAndCategoryAndDefaultVariant(slug, options = {}) {
    return await Product.findOne({
      where: { slug },
      include: options.include || [
        { model: ProductType, as: "ProductType", attributes: ["id", "name", "slug"], required: false },
        { model: ProductCategory, as: "ProductCategory", attributes: ["id", "name", "slug"], required: false },
        { model: ProductVariant, as: "ProductVariants", where: { isDefault: true }, required: false, limit: 1, include: [{ model: ProductPrice, as: "ProductPrices", where: { isDefault: true }, required: false, limit: 1 }] },
      ],
      ...options,
    });
  },

  async findActiveBySlug(slug, options = {}) {
    return await Product.findOne({
      where: { slug, active: true },
      ...options,
    });
  },

  /** Find active product by slug with ProductType, ProductCategory and default variant (for ownership checks in event-type and seminar sections). */
  async findActiveBySlugWithTypeAndCategory(slug, options = {}) {
    return await Product.findOne({
      where: { slug, active: true },
      include: options.include || [
        { model: ProductType, as: "ProductType", attributes: ["id", "name", "slug"], required: false },
        { model: ProductCategory, as: "ProductCategory", attributes: ["id", "name", "slug"], required: false },
        { model: TaxRate, as: "TaxRate", attributes: ["percentage"], required: false },
        { model: ProductVariant, as: "ProductVariants", where: { isDefault: true, active: true }, required: false, limit: 1, include: [{ model: ProductPrice, as: "ProductPrices", where: { isDefault: true }, required: false, limit: 1 }] },
      ],
      ...options,
    });
  },

  /**
   * Find all products by product type slug (e.g. 'seminar').
   * Used by seminar controllers which still discriminate on ProductType.
   */
  async findAllByProductTypeSlug(productTypeSlug, options = {}) {
    const productType = await productTypeRepo.findBySlug(productTypeSlug, options);
    if (!productType) return [];
    return await Product.findAll({
      where: { productTypeId: productType.id },
      include: options.include || [
        { model: ProductType, as: "ProductType", attributes: ["id", "name", "slug"], required: false },
        { model: ProductCategory, as: "ProductCategory", attributes: ["id", "name", "slug"], required: false },
        { model: ProductVariant, as: "ProductVariants", where: { isDefault: true }, required: false, limit: 1, include: [{ model: ProductPrice, as: "ProductPrices", where: { isDefault: true }, required: false, limit: 1 }] },
      ],
      order: [["title", "ASC"]],
      ...options,
    });
  },

  /**
   * Find all products by product category slug (e.g. 'webinars', 'classrooms').
   * Used by event-type controllers that discriminate on ProductCategory.
   */
  async findAllByProductCategorySlug(categorySlug, options = {}) {
    const category = await productCategoryRepo.findBySlug(categorySlug, options);
    if (!category) return [];
    return await Product.findAll({
      where: { productCategoryId: category.id },
      include: options.include || [
        { model: ProductType, as: "ProductType", attributes: ["id", "name", "slug"], required: false },
        { model: ProductCategory, as: "ProductCategory", attributes: ["id", "name", "slug"], required: false },
        { model: ProductVariant, as: "ProductVariants", where: { isDefault: true }, required: false, limit: 1, include: [{ model: ProductPrice, as: "ProductPrices", where: { isDefault: true }, required: false, limit: 1 }] },
      ],
      order: [["title", "ASC"]],
      ...options,
    });
  },

  /**
   * Get default variant and its default price for a product (blueprint for live sessions).
   */
  async getDefaultVariantWithPrice(productId, options = {}) {
    const variant = await ProductVariant.findOne({
      where: { productId, isDefault: true },
      include: [{ model: ProductPrice, as: "ProductPrices", where: { isDefault: true }, required: false, limit: 1 }],
      ...options,
    });
    return variant;
  },

  /**
   * Get all variants for a product (use when managing variants in admin or displaying size/color options).
   */
  async getVariants(productId, options = {}) {
    return await ProductVariant.findAll({
      where: { productId },
      order: [["isDefault", "DESC"], ["title", "ASC"]],
      ...options,
    });
  },

  /**
   * Create product only (no variant, no price, no meta). Used for event-based offerings (webinars)
   * where variants are created when events are added.
   */
  async createProductOnly(data, options = {}) {
    const { title, slug, description, productTypeId, productCategoryId, active = true, isPhysical = false } = data;
    const product = await Product.create(
      {
        title: String(title).trim(),
        slug: String(slug).trim(),
        description: description ? String(description).trim() : null,
        productTypeId: productTypeId || null,
        productCategoryId: productCategoryId || null,
        active: !!active,
        isPhysical: isPhysical === "on" || isPhysical === true,
        weight: null,
        weightUnit: null,
      },
      options
    );
    return product;
  },

  /**
   * Create a single variant with one default price for a product (e.g. for event-based offerings).
   */
  async createVariantWithDefaultPrice(
    productId,
    { title = "Default", amount = 0, currency = DEFAULT_CURRENCY, quantity = 0, sku: skuOverride = null, active: activeVal = true } = {},
    options = {}
  ) {
    const product = await Product.findByPk(productId, { attributes: ["id", "title"], ...options });
    let sku;
    if (skuOverride != null && String(skuOverride).trim() !== "") {
      sku = String(skuOverride).trim();
      const dup = await ProductVariant.findOne({ where: { productId, sku }, ...options });
      if (dup) {
        const err = new Error("SKU already exists for this product.");
        err.code = "SKU_CONFLICT";
        throw err;
      }
    } else {
      const variantCount = await ProductVariant.count({ where: { productId }, ...options });
      sku = generateVariantSku(product ? product.title : title, variantCount);
    }
    const active = activeVal !== false && activeVal !== "off";
    const variant = await ProductVariant.create(
      {
        productId,
        title: String(title).trim() || "Default",
        sku,
        isDefault: false,
        active,
        quantity: Number(quantity) >= 0 ? Number(quantity) : 0,
      },
      options
    );
    await ProductPrice.create(
      {
        productVariantId: variant.id,
        amount: Number(amount) || 0,
        currency: DEFAULT_CURRENCY.substring(0, 3),
        isDefault: true,
      },
      options
    );
    return variant;
  },

  /**
   * Create product and its default variant + default price (single price in default currency).
   * Accepts metaObjectIds and metaObjectValues for per-product meta object instance values.
   */
  async create(data, options = {}) {
    const { title, slug, description, productTypeId, productCategoryId, taxRateId, active = true, priceAmount, /* currency is ignored */ quantity, metaObjectIds, metaObjectValues, mediaIds, isPhysical, weight, weightUnit, unitOfMeasure } = data;
    const t = options.transaction || (await sequelize.transaction());
    const ownTransaction = !options.transaction;
    try {
      const physical = isPhysical === "on" || isPhysical === true;
      const weightVal = physical && weight !== "" && weight != null && !isNaN(Number(weight)) ? Number(weight) : null;
      const unitVal = weightVal != null && (weightUnit === WEIGHT_UNIT.G || weightUnit === WEIGHT_UNIT.KG) ? weightUnit : (weightVal != null ? "kg" : null);
      const product = await Product.create(
        {
          title: String(title).trim(),
          slug: String(slug).trim(),
          description: description ? String(description).trim() : null,
          productTypeId: productTypeId || null,
          productCategoryId: productCategoryId || null,
          taxRateId: taxRateId || null,
          active: !!active,
          isPhysical: physical,
          weight: weightVal,
          weightUnit: unitVal,
          unitOfMeasure: unitOfMeasure || null,
        },
        { transaction: t }
      );
      const defaultQuantity = data.quantity != null && data.quantity !== "" ? Math.max(0, parseInt(String(data.quantity), 10) || 0) : 0;
      const variant = await ProductVariant.create(
        {
          productId: product.id,
          title: "Default",
          sku: generateVariantSku(String(title).trim(), 0),
          isDefault: true,
          active: true,
          quantity: defaultQuantity,
        },
        { transaction: t }
      );
      const amount = priceAmount != null && priceAmount !== "" ? Number(priceAmount) : 0;
      await ProductPrice.create(
        {
          productVariantId: variant.id,
          amount,
          currency: DEFAULT_CURRENCY.substring(0, 3),
          isDefault: true,
        },
        { transaction: t }
      );
      await syncProductMetaObjects(product.id, metaObjectIds, metaObjectValues, { transaction: t });
      await syncProductMedia(product.id, data.mediaIds, { transaction: t });
      if (ownTransaction) await t.commit();
      return await Product.findByPk(product.id, {
        include: [
          { model: ProductVariant, as: "ProductVariants" },
          { model: MetaObject, as: "metaObjects", through: { attributes: META_OBJECTS_THROUGH_ATTRIBUTES }, required: false },
        ],
        transaction: ownTransaction ? undefined : t,
      });
    } catch (e) {
      if (ownTransaction) await t.rollback();
      throw e;
    }
  },

  async update(id, data, options = {}) {
    const product = await Product.findByPk(id, options);
    if (!product) return null;
    const { title, slug, description, productTypeId, productCategoryId, taxRateId, active, priceAmount, currency, quantity, metaObjectIds, metaObjectValues, mediaIds, isPhysical, weight, weightUnit, unitOfMeasure } = data;
    const payload = {};
    if (title !== undefined) payload.title = String(title).trim();
    if (slug !== undefined) payload.slug = String(slug).trim();
    if (description !== undefined) payload.description = description ? String(description).trim() : null;
    if (productTypeId !== undefined) payload.productTypeId = productTypeId || null;
    if (productCategoryId !== undefined) payload.productCategoryId = productCategoryId || null;
    if (taxRateId !== undefined) payload.taxRateId = taxRateId || null;
    if (active !== undefined) payload.active = !!active;
    if (isPhysical !== undefined) {
      const physical = isPhysical === "on" || isPhysical === true;
      payload.isPhysical = physical;
      if (!physical) {
        payload.weight = null;
        payload.weightUnit = null;
      } else if (weight !== undefined || weightUnit !== undefined) {
        const weightVal = weight !== "" && weight != null && !isNaN(Number(weight)) ? Number(weight) : null;
        payload.weight = weightVal;
        payload.weightUnit = weightVal != null && (weightUnit === WEIGHT_UNIT.G || weightUnit === WEIGHT_UNIT.KG) ? weightUnit : (weightVal != null ? "kg" : null);
      }
    } else if (weight !== undefined || weightUnit !== undefined) {
      const weightVal = weight !== "" && weight != null && !isNaN(Number(weight)) ? Number(weight) : null;
      payload.weight = weightVal;
      payload.weightUnit = weightVal != null && (weightUnit === WEIGHT_UNIT.G || weightUnit === WEIGHT_UNIT.KG) ? weightUnit : (weightVal != null ? "kg" : null);
    }
    if (unitOfMeasure !== undefined) {
      payload.unitOfMeasure = unitOfMeasure || null;
    }
    await product.update(payload, options);
    if (priceAmount !== undefined || currency !== undefined) {
      const variant = await ProductVariant.findOne({ where: { productId: id, isDefault: true }, ...options });
      if (variant) {
        const price = await ProductPrice.findOne({ where: { productVariantId: variant.id, isDefault: true }, ...options });
        if (price) {
          const updatePrice = {};
          if (priceAmount !== undefined && priceAmount !== "") updatePrice.amount = Number(priceAmount);
          // currency is not user-editable; always keep default value
          updatePrice.currency = DEFAULT_CURRENCY.substring(0, 3);
          if (Object.keys(updatePrice).length) await price.update(updatePrice, options);
        }
      }
    }
    if (quantity !== undefined) {
      const variant = await ProductVariant.findOne({ where: { productId: id, isDefault: true }, ...options });
      if (variant) {
        const q = Math.max(0, parseInt(String(quantity), 10) || 0);
        await variant.update({ quantity: q }, options);
      }
    }
    if (metaObjectIds !== undefined) {
      await syncProductMetaObjects(id, metaObjectIds, metaObjectValues, options);
    }
    if (data.mediaIds !== undefined) {
      await syncProductMedia(id, data.mediaIds, options);
    }
    return product;
  },

  /**
   * Delete a product. Fails if the product has been ordered (order_lines reference its variants).
   * @returns {{ deleted: boolean, error?: string }}
   */
  async delete(id, options = {}) {
    const product = await Product.findByPk(id, { ...options, include: [{ model: ProductVariant, as: "ProductVariants", attributes: ["id"] }] });
    if (!product) return { deleted: false, error: "Product not found." };
    const variantIds = (product.ProductVariants || []).map((v) => v.id);
    if (variantIds.length > 0) {
      const orderLineCount = await OrderLine.count({
        where: { productVariantId: variantIds },
        ...options,
      });
      if (orderLineCount > 0) {
        return { deleted: false, error: "Cannot delete product: it has been ordered. Remove or archive orders first." };
      }
    }
    try {
      await product.destroy(options);
      return { deleted: true };
    } catch (err) {
      if (err.name === "SequelizeForeignKeyConstraintError") {
        return { deleted: false, error: "Cannot delete product: it is referenced by orders or other data." };
      }
      throw err;
    }
  },

  async count(options = {}) {
    return await Product.count(options);
  },

  async countByTypeSlug(typeSlug) {
    return await Product.count({
      include: [{ model: ProductType, as: "ProductType", where: { slug: typeSlug }, required: true }],
      distinct: true,
    });
  },

  async countByCategorySlug(categorySlug) {
    return await Product.count({
      include: [{ model: ProductCategory, as: "ProductCategory", where: { slug: categorySlug }, required: true }],
      distinct: true,
    });
  },
};
