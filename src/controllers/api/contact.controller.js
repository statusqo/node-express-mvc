const { validateContact } = require("../../validators/contact.schema");
const emailService = require("../../services/email.service");
const config = require("../../config");
const logger = require("../../config/logger");

module.exports = {
  async submit(req, res) {
    // Honeypot: bots fill hidden fields
    if (req.body.website) {
      return res.redirect("/contact?ok=1");
    }

    const parsed = validateContact(req.body);
    if (!parsed.ok) {
      return res.redirect("/contact?fail=1");
    }

    try {
      await emailService.sendContactEmail(parsed.data);
    } catch (err) {
      logger.warn("Contact form: email send failed", { error: err.message });
      if (config.env === "production") {
        return res.redirect("/contact?fail=1");
      }
    }

    return res.redirect("/contact?ok=1");
  }
};
