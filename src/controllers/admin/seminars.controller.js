/**
 * Admin: Seminar products only — no Event / Zoom workflow. Products are edited under Products.
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
    });
    res.render("admin/seminars/index", {
      title: "Seminars",
      products: list,
      sectionPath: SECTION_PATH,
    });
  },
};
