const productService = require("../../services/product.service");
const { parseDefinitionPairs } = require("../../validators/metaObject.schema");
const config = require("../../config");

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
    const productList = (products || []).map((p) => {
      const plain = toPlain(p);
      const variant = plain.ProductVariants && plain.ProductVariants[0];
      const priceRow = variant?.ProductPrices?.[0];
      const media = mediaWithUrls(plain.media);
      return {
        ...plain,
        defaultVariantId: variant?.id || null,
        price: priceRow ? Number(priceRow.amount) : null,
        currency: priceRow?.currency || "USD",
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
    const currency = priceRow?.currency || "USD";
    const plain = toPlain(product);
    const metaObjectsWithTypes = (plain.metaObjects || []).map((mo) => ({
      ...mo,
      definitionPairs: parseDefinitionPairs(mo.definition),
    }));
    const media = mediaWithUrls(plain.media);
    res.render("web/products/show", {
      title: product.title,
      product: { ...plain, metaObjects: metaObjectsWithTypes, media },
      defaultVariantId: defaultVariant?.id || null,
      productVariantId: defaultVariant?.id || null,
      price,
      currency,
      uploadsBaseUrl,
    });
  },
};
