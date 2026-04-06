const { validateContact } = require("../../validators/contact.schema");
const emailService = require("../../services/email.service");
const config = require("../../config");
const logger = require("../../config/logger");

module.exports = {
  async contact(req, res) {
    const ok = req.query.ok === "1";
    const fail = req.query.fail === "1";
    res.render("web/contact", { title: "Contact", ok, fail });
  },

  async submit(req, res) {
    // Honeypot: silent success for bots that fill the hidden field
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
  },
};