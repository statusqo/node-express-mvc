const { validateSeminarInquiry } = require("../../validators/seminarInquiry.schema");
const emailService = require("../../services/email.service");
const productService = require("../../services/product.service");
const config = require("../../config");
const logger = require("../../config/logger");

const SEMINAR_TYPE_SLUG = "seminar";

function toPlain(obj) {
  return obj && typeof obj.get === "function" ? obj.get({ plain: true }) : obj;
}

module.exports = {
  async submitInquiry(req, res) {
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
    const product = await productService.findActiveBySlugWithType(seminarSlug);
    if (!product) {
      return res.redirect("/seminars?inquiry=fail");
    }
    const plain = toPlain(product);
    const typeSlug = plain.ProductType && plain.ProductType.slug;
    if (typeSlug !== SEMINAR_TYPE_SLUG) {
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
