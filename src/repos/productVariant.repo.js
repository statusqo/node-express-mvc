const { ProductVariant, Product, ProductPrice, ProductCategory, TaxRate } = require("../models");
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

  async getOrderLineSnapshot(variantId, options = {}) {
    const variant = await ProductVariant.findByPk(variantId, {
      include: [
        {
          model: Product,
          as: "Product",
          attributes: ["id", "title", "unitOfMeasure"],
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
      ...options,
    });
    if (!variant) return null;
    const product = variant.Product || (await Product.findByPk(variant.productId, options));
    const priceRow = variant.ProductPrices?.[0] || (await this.getDefaultPrice(variantId, options));
    return {
      productVariantId: variant.id,
      title: product?.title || variant.title || "Product",
      price: priceRow ? Number(priceRow.amount) : 0,
      currency: DEFAULT_CURRENCY,
      vatRate: product?.TaxRate?.percentage != null ? Number(product.TaxRate.percentage) : 25,
      sku: variant.sku || null,
      kpd: product?.ProductCategory?.kpdCode || null,
      unit: product?.unitOfMeasure || null,
      stripeTaxRateId: product?.TaxRate?.stripeTaxRateId || null,
    };
  },
};
