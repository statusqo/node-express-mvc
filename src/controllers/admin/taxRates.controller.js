const taxRateService = require("../../services/taxRate.service");
const { validateTaxRate } = require("../../validators/taxRate.schema");

function toPlain(obj) {
  return obj && typeof obj.get === "function" ? obj.get({ plain: true }) : obj;
}

module.exports = {
  async index(req, res) {
    const taxRates = await taxRateService.findAll();
    res.render("admin/tax-rates/index", {
      title: "Tax Rates",
      taxRates: (taxRates || []).map(toPlain),
    });
  },

  async newForm(req, res) {
    res.render("admin/tax-rates/form", {
      title: "New Tax Rate",
      taxRate: null,
      isEdit: false,
    });
  },

  async create(req, res) {
    const result = validateTaxRate(req.body);
    if (!result.ok) {
      return res.status(400).render("admin/tax-rates/form", {
        title: "New Tax Rate",
        taxRate: req.body,
        isEdit: false,
        error: result.errors[0].message,
      });
    }
    const existing = await taxRateService.findByStripeId(result.data.stripeTaxRateId);
    if (existing) {
      return res.status(400).render("admin/tax-rates/form", {
        title: "New Tax Rate",
        taxRate: req.body,
        isEdit: false,
        error: "A tax rate with this Stripe Tax Rate ID already exists.",
      });
    }
    await taxRateService.create(result.data);
    res.setFlash("success", "Tax rate created.");
    res.redirect((req.adminPrefix || "") + "/tax-rates");
  },

  async editForm(req, res) {
    const taxRate = await taxRateService.findById(req.params.id);
    if (!taxRate) {
      res.setFlash("error", "Tax rate not found.");
      return res.redirect((req.adminPrefix || "") + "/tax-rates");
    }
    res.render("admin/tax-rates/form", {
      title: "Edit Tax Rate",
      taxRate: toPlain(taxRate),
      isEdit: true,
    });
  },

  async update(req, res) {
    const { id } = req.params;
    const taxRate = await taxRateService.findById(id);
    if (!taxRate) {
      res.setFlash("error", "Tax rate not found.");
      return res.redirect((req.adminPrefix || "") + "/tax-rates");
    }
    const result = validateTaxRate(req.body);
    if (!result.ok) {
      return res.status(400).render("admin/tax-rates/form", {
        title: "Edit Tax Rate",
        taxRate: { id, ...req.body },
        isEdit: true,
        error: result.errors[0].message,
      });
    }
    const existing = await taxRateService.findByStripeId(result.data.stripeTaxRateId);
    if (existing && String(existing.id) !== String(id)) {
      return res.status(400).render("admin/tax-rates/form", {
        title: "Edit Tax Rate",
        taxRate: { id, ...req.body },
        isEdit: true,
        error: "A tax rate with this Stripe Tax Rate ID already exists.",
      });
    }
    await taxRateService.update(id, result.data);
    res.setFlash("success", "Tax rate updated.");
    res.redirect((req.adminPrefix || "") + "/tax-rates");
  },

  async delete(req, res) {
    const result = await taxRateService.delete(req.params.id);
    if (result.deleted) res.setFlash("success", "Tax rate deleted.");
    else res.setFlash("error", result.error || "Tax rate not found.");
    res.redirect((req.adminPrefix || "") + "/tax-rates");
  },
};
