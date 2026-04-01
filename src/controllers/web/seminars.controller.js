/**
 * Storefront seminars: catalog products of type "seminar" (no Event sessions — arrange via inquiry).
 */
const productService = require("../../services/product.service");
const { DEFAULT_CURRENCY } = require("../../config/constants");

const SEMINAR_TYPE_SLUG = "seminar";
const SECTION_PATH = "seminars";

function toPlain(obj) {
  return obj && typeof obj.get === "function" ? obj.get({ plain: true }) : obj;
}

module.exports = {
  async index(req, res) {
    const products = await productService.findAllByTypeSlug(SEMINAR_TYPE_SLUG);
    const list = (products || []).map((p) => {
      const plain = toPlain(p);
      const variant = plain.ProductVariants && plain.ProductVariants[0];
      const priceRow = variant?.ProductPrices?.[0];
      return {
        ...plain,
        priceAmount: priceRow ? Number(priceRow.amount) : null,
        currency: DEFAULT_CURRENCY,
      };
    }).filter((p) => p.active);

    res.render("web/seminars/index", {
      title: "Seminars",
      products: list,
      sectionPath: SECTION_PATH,
    });
  },

  async show(req, res) {
    const { slug } = req.params;
    const product = await productService.findActiveBySlugWithType(slug);
    if (!product) {
      res.setFlash("error", "Seminar not found.");
      return res.redirect("/seminars");
    }
    const plain = toPlain(product);
    const productTypeSlug = plain.ProductType && plain.ProductType.slug;
    if (productTypeSlug !== SEMINAR_TYPE_SLUG) {
      res.setFlash("error", "Seminar not found.");
      return res.redirect("/seminars");
    }
    const variant = plain.ProductVariants && plain.ProductVariants[0];
    const priceRow = variant?.ProductPrices?.[0];

    res.render("web/seminars/show", {
      title: plain.title,
      product: plain,
      priceAmount: priceRow ? Number(priceRow.amount) : null,
      currency: DEFAULT_CURRENCY,
      sectionPath: SECTION_PATH,
      inquiryOk: req.query.inquiry === "ok",
      inquiryFail: req.query.inquiry === "fail",
    });
  },
};
