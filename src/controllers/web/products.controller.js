const productService = require("../../services/product.service");
const { parseDefinitionPairs } = require("../../validators/metaObject.schema");
const config = require("../../config");
const { DEFAULT_CURRENCY } = require("../../config/constants");

function toPlain(obj) {
  return obj && typeof obj.get === "function" ? obj.get({ plain: true }) : obj;
}

const uploadsBaseUrl = config.uploads?.urlPath || "/uploads";

function mediaWithUrls(mediaArray) {
  if (!mediaArray || !Array.isArray(mediaArray)) return [];
  return mediaArray
    .sort((a, b) => (a.ProductMedia?.sortOrder ?? 0) - (b.ProductMedia?.sortOrder ?? 0))
    .map((m) => {
      const p = toPlain(m);
      const path = (p.path || "").replace(/\\/g, "/");
      return {
        id: p.id,
        path,
        filename: p.filename,
        mimeType: p.mimeType,
        alt: p.alt,
        url: uploadsBaseUrl + (path ? "/" + path : ""),
      };
    });
}

module.exports = {
  async index(req, res) {
    const products = await productService.findAll({
      where: { active: true },
      order: [["title", "ASC"]],
    });
    const plains = (products || []).map((p) => {
      const plain = toPlain(p);
      const variant = plain.ProductVariants && plain.ProductVariants[0];
      const priceRow = variant?.ProductPrices?.[0];
      return { plain, variant, priceRow };
    });
    const productIds = plains.map(({ plain }) => plain.id).filter(Boolean);
    const priceRanges = await productService.getVariantPriceRangesByProductIds(productIds);
    const productList = plains.map(({ plain, variant, priceRow }) => {
      const media = mediaWithUrls(plain.media);
      return {
        ...plain,
        defaultVariantId: variant?.id || null,
        defaultVariantQuantity: variant?.quantity ?? 0,
        price: priceRow ? Number(priceRow.amount) : null,
        variantPriceRange: priceRanges.get(plain.id) || null,
        currency: DEFAULT_CURRENCY,
        media,
      };
    });
    res.render("web/products/index", {
      title: "Products",
      products: productList,
      uploadsBaseUrl,
    });
  },

  async show(req, res) {
    const product = await productService.findActiveBySlug(req.params.slug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect("/products");
    }
    const defaultVariant = product.ProductVariants && product.ProductVariants[0];
    const priceRow = defaultVariant?.ProductPrices?.[0];
    const price = priceRow ? Number(priceRow.amount) : null;
    const currency = DEFAULT_CURRENCY;
    const plain = toPlain(product);
    const metaObjectsWithTypes = (plain.metaObjects || []).map((mo) => ({
      ...mo,
      definitionPairs: parseDefinitionPairs(mo.definition),
    }));
    const media = mediaWithUrls(plain.media);
    const allManageable = await productService.listManageableExtraVariants(plain.id);
    const variants = allManageable.filter((v) => v.active);
    res.render("web/products/show", {
      title: product.title,
      product: { ...plain, metaObjects: metaObjectsWithTypes, media },
      defaultVariantId: defaultVariant?.id || null,
      defaultVariantQuantity: defaultVariant?.quantity ?? 0,
      price,
      currency,
      variants,
      uploadsBaseUrl,
    });
  },
};
