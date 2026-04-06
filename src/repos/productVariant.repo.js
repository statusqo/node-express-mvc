const { Op, Sequelize } = require("sequelize");
const { ProductVariant, Product, ProductPrice, ProductCategory, TaxRate, Event } = require("../models");
const { DEFAULT_CURRENCY } = require("../config/constants");

module.exports = {
  async findById(id, options = {}) {
    return await ProductVariant.findByPk(id, options);
  },

  async findDefaultForProduct(productId, options = {}) {
    return await ProductVariant.findOne({
      where: { productId, isDefault: true },
      ...options,
    });
  },

  async getDefaultPrice(variantId, options = {}) {
    const price = await ProductPrice.findOne({
      where: { productVariantId: variantId, isDefault: true },
      ...options,
    });
    return price;
  },

  async getDisplayPrice(variantId, options = {}) {
    const variant = await ProductVariant.findByPk(variantId, {
      include: [{ model: ProductPrice, as: "ProductPrices", where: { isDefault: true }, required: false }],
      ...options,
    });
    const price = variant?.ProductPrices?.[0] || (await this.getDefaultPrice(variantId, options));
    return price ? Number(price.amount) : 0;
  },

  async update(id, data, options = {}) {
    const row = await ProductVariant.findByPk(id, options);
    if (!row) return null;
    return await row.update(data, options);
  },

  /**
   * Update the default price row for a variant.
   */
  async updateDefaultPrice(variantId, data, options = {}) {
    const price = await ProductPrice.findOne({ where: { productVariantId: variantId, isDefault: true }, ...options });
    if (!price) return null;
    return await price.update(data, options);
  },

  /**
   * Hard-delete the variant record.
   */
  async destroy(variantId, options = {}) {
    await ProductVariant.destroy({ where: { id: variantId }, ...options });
  },

  /**
   * Hard-delete all ProductPrice rows for a variant.
   */
  async destroyPrices(variantId, options = {}) {
    await ProductPrice.destroy({ where: { productVariantId: variantId }, ...options });
  },

  /**
   * Decrement quantity by `by` only if current quantity >= `by`. Prevents oversell under concurrency.
   * @returns {Promise<boolean>} true if exactly one row was updated
   */
  async decrementQuantityIfAvailable(variantId, by, options = {}) {
    const n = Math.floor(Number(by));
    if (!Number.isFinite(n) || n < 1) return true;
    const dec = Math.min(n, Number.MAX_SAFE_INTEGER);
    const [updatedCount] = await ProductVariant.update(
      { quantity: Sequelize.literal(`quantity - ${dec}`) },
      {
        where: {
          id: variantId,
          quantity: { [Op.gte]: dec },
        },
        ...options,
      },
    );
    return updatedCount === 1;
  },

  /**
   * Decrement quantity by `by` and clamp to zero if it goes negative.
   * Used when recording a payment — seats sold.
   */
  async decrementQuantityAndClamp(variantId, by, options = {}) {
    const variant = await ProductVariant.findByPk(variantId, options);
    if (!variant) return;
    await variant.decrement("quantity", { by, ...options });
    await variant.reload(options);
    if (variant.quantity < 0) await variant.update({ quantity: 0 }, options);
  },

  /**
   * Increment quantity by `by`. Used when restoring seats after a refund.
   */
  async incrementQuantity(variantId, by, options = {}) {
    const variant = await ProductVariant.findByPk(variantId, options);
    if (!variant) return;
    await variant.increment("quantity", { by, ...options });
  },

  async getOrderLineSnapshot(variantId, options = {}) {
    const checkoutVatEnabled = options.checkoutVatEnabled !== false;
    const { checkoutVatEnabled: _omitVatFlag, ...sequelizeOpts } = options;
    const variant = await ProductVariant.findByPk(variantId, {
      include: [
        {
          model: Product,
          as: "Product",
          attributes: ["id", "title", "unitOfMeasure", "taxRateId"],
          include: [
            {
              model: ProductCategory,
              as: "ProductCategory",
              attributes: ["id", "kpdCode"],
              required: false,
            },
            {
              model: TaxRate,
              as: "TaxRate",
              attributes: ["id", "stripeTaxRateId", "percentage"],
              required: false,
            },
          ],
        },
        { model: ProductPrice, as: "ProductPrices", where: { isDefault: true }, required: false, limit: 1 },
      ],
      ...sequelizeOpts,
    });
    if (!variant) return null;
    const product = variant.Product || (await Product.findByPk(variant.productId, sequelizeOpts));
    const priceRow = variant.ProductPrices?.[0] || (await this.getDefaultPrice(variantId, sequelizeOpts));
    const base = {
      productVariantId: variant.id,
      title: product?.title || variant.title || "Product",
      price: priceRow ? Number(priceRow.amount) : 0,
      currency: DEFAULT_CURRENCY,
      sku: variant.sku || null,
      kpd: product?.ProductCategory?.kpdCode || null,
      unit: product?.unitOfMeasure || null,
    };
    if (!checkoutVatEnabled) {
      return { ...base, vatRate: null, stripeTaxRateId: null };
    }
    const pct = product?.TaxRate?.percentage;
    const txr = product?.TaxRate?.stripeTaxRateId || null;
    return {
      ...base,
      vatRate: pct != null ? Number(pct) : null,
      stripeTaxRateId: txr,
    };
  },

  /**
   * Returns a Map<productId, { min, max }> of price ranges for manageable
   * (non-default, non-event-linked, active) variants across the given product IDs.
   * Performs two flat queries + in-memory aggregation to stay dialect-agnostic.
   */
  async getVariantPriceRangesByProductIds(productIds, options = {}) {
    if (!productIds || productIds.length === 0) return new Map();

    // 1. Collect all event-linked variant IDs for these products in one query.
    const eventRows = await Event.findAll({
      where: {
        productId: { [Op.in]: productIds },
        productVariantId: { [Op.ne]: null },
      },
      attributes: ["productVariantId"],
      raw: true,
      ...options,
    });
    const eventLinkedIds = new Set(eventRows.map((r) => r.productVariantId));

    // 2. Fetch all non-default, active variants with their default price.
    const variants = await ProductVariant.findAll({
      where: { productId: { [Op.in]: productIds }, isDefault: false, active: true },
      include: [
        {
          model: ProductPrice,
          as: "ProductPrices",
          where: { isDefault: true },
          required: true,
          attributes: ["amount"],
        },
      ],
      attributes: ["id", "productId"],
      ...options,
    });

    // 3. Compute min/max per productId, skipping event-linked variants.
    const ranges = new Map();
    for (const v of variants) {
      if (eventLinkedIds.has(v.id)) continue;
      const plain = v.get ? v.get({ plain: true }) : v;
      const priceRow = plain.ProductPrices && plain.ProductPrices[0];
      if (!priceRow) continue;
      const amount = Number(priceRow.amount);
      const pid = plain.productId;
      const existing = ranges.get(pid);
      if (!existing) {
        ranges.set(pid, { min: amount, max: amount });
      } else {
        ranges.set(pid, { min: Math.min(existing.min, amount), max: Math.max(existing.max, amount) });
      }
    }
    return ranges;
  },
};
