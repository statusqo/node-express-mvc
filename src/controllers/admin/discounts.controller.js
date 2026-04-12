const discountService = require("../../services/discount.service");
const { validateDiscount } = require("../../validators/discount.schema");

function toPlain(obj) {
  return obj && typeof obj.get === "function" ? obj.get({ plain: true }) : obj;
}

module.exports = {
  async index(req, res) {
    const discounts = await discountService.findAll();
    res.render("admin/discounts/index", {
      title: "Discounts",
      discounts: (discounts || []).map(toPlain),
    });
  },

  async newForm(req, res) {
    res.render("admin/discounts/form", {
      title: "New Discount",
      discount: null,
      isEdit: false,
    });
  },

  async create(req, res) {
    const result = validateDiscount(req.body);
    if (!result.ok) {
      return res.status(400).render("admin/discounts/form", {
        title: "New Discount",
        discount: req.body,
        isEdit: false,
        error: result.errors[0].message,
        });
    }
    try {
      await discountService.create(result.data);
    } catch (err) {
      if (err.status === 409) {
        return res.status(409).render("admin/discounts/form", {
          title: "New Discount",
          discount: req.body,
          isEdit: false,
          error: err.message,
            });
      }
      throw err;
    }
    res.setFlash("success", "Discount created.");
    res.redirect((req.adminPrefix || "") + "/discounts");
  },

  async editForm(req, res) {
    const discount = await discountService.findById(req.params.id);
    if (!discount) {
      res.setFlash("error", "Discount not found.");
      return res.redirect((req.adminPrefix || "") + "/discounts");
    }
    res.render("admin/discounts/form", {
      title: "Edit Discount",
      discount: toPlain(discount),
      isEdit: true,
    });
  },

  async update(req, res) {
    const { id } = req.params;
    const result = validateDiscount(req.body);
    if (!result.ok) {
      return res.status(400).render("admin/discounts/form", {
        title: "Edit Discount",
        discount: { id, ...req.body },
        isEdit: true,
        error: result.errors[0].message,
        });
    }
    try {
      await discountService.update(id, result.data);
    } catch (err) {
      if (err.status === 404) {
        res.setFlash("error", "Discount not found.");
        return res.redirect((req.adminPrefix || "") + "/discounts");
      }
      if (err.status === 409) {
        return res.status(409).render("admin/discounts/form", {
          title: "Edit Discount",
          discount: { id, ...req.body },
          isEdit: true,
          error: err.message,
            });
      }
      throw err;
    }
    res.setFlash("success", "Discount updated.");
    res.redirect((req.adminPrefix || "") + "/discounts");
  },

  async delete(req, res) {
    const result = await discountService.delete(req.params.id);
    if (result.deleted) res.setFlash("success", "Discount deleted.");
    else res.setFlash("error", result.error || "Discount not found.");
    res.redirect((req.adminPrefix || "") + "/discounts");
  },
};
