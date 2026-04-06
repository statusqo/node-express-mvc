/**
 * Storefront seminars: catalog products of type "seminar" (no Event sessions — arrange via inquiry).
 */
const productService = require("../../services/product.service");
const { validateSeminarInquiry } = require("../../validators/seminarInquiry.schema");
const emailService = require("../../services/email.service");
const { DEFAULT_CURRENCY } = require("../../config/constants");
const config = require("../../config");
const logger = require("../../config/logger");

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
    const product = await productService.findActiveBySlugWithTypeAndCategory(slug);
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

  async submitInquiry(req, res) {
    // Honeypot: silent success for bots that fill the hidden field
    if (req.body.website) {
      const slug = String(req.body.seminarSlug || "").trim();
      return res.redirect(slug ? `/seminars/${encodeURIComponent(slug)}?inquiry=ok` : "/seminars?inquiry=ok");
    }

    const parsed = validateSeminarInquiry(req.body);
    if (!parsed.ok) {
      const slug = String(req.body.seminarSlug || "").trim();
      return res.redirect(slug ? `/seminars/${encodeURIComponent(slug)}?inquiry=fail` : "/seminars?inquiry=fail");
    }

    const { name, email, message, seminarSlug } = parsed.data;
    const product = await productService.findActiveBySlugWithTypeAndCategory(seminarSlug);
    if (!product) {
      return res.redirect("/seminars?inquiry=fail");
    }
    const plain = toPlain(product);
    if ((plain.ProductType && plain.ProductType.slug) !== SEMINAR_TYPE_SLUG) {
      return res.redirect("/seminars?inquiry=fail");
    }

    try {
      await emailService.sendSeminarInquiryEmail({
        name,
        email,
        message,
        productTitle: plain.title,
        productSlug: plain.slug,
      });
    } catch (err) {
      logger.warn("Seminar inquiry: email send failed", { error: err.message, seminarSlug });
      if (config.env === "production") {
        return res.redirect(`/seminars/${encodeURIComponent(seminarSlug)}?inquiry=fail`);
      }
    }

    return res.redirect(`/seminars/${encodeURIComponent(seminarSlug)}?inquiry=ok`);
  },
};
