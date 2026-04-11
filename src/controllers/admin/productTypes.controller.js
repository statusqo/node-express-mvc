const productTypeService = require("../../services/productType.service");
const { validateProductType } = require("../../validators/productType.schema");

function slugify(s) {
  if (!s || typeof s !== "string") return "";
  return s.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function toPlain(obj) {
  return obj && typeof obj.get === "function" ? obj.get({ plain: true }) : obj;
}

module.exports = {
  async index(req, res) {
    const productTypes = await productTypeService.findAll();
    const list = (productTypes || []).map(toPlain);
    res.render("admin/product-types/index", { title: "Product Types", productTypes: list });
  },

  async newForm(req, res) {
    res.render("admin/product-types/form", { title: "New Product Type", productType: null, isEdit: false });
  },

  async create(req, res) {
    const slugVal = req.body.slug ? String(req.body.slug).trim() : slugify(req.body.name);
    const result = validateProductType(req.body, slugVal);
    if (!result.ok) {
      return res.status(400).render("admin/product-types/form", {
        title: "New Product Type",
        productType: { name: req.body.name, slug: slugVal },
        isEdit: false,
        error: result.errors[0].message,
      });
    }
    const existing = await productTypeService.findBySlug(result.data.slug);
    if (existing) {
      return res.status(400).render("admin/product-types/form", {
        title: "New Product Type",
        productType: { name: req.body.name, slug: slugVal },
        isEdit: false,
        error: "A product type with this slug already exists.",
      });
    }
    await productTypeService.create(result.data);
    res.setFlash("success", "Product type created.");
    res.redirect((req.adminPrefix || "") + "/product-types");
  },

  async editForm(req, res) {
    const productType = await productTypeService.findById(req.params.id);
    if (!productType) {
      res.setFlash("error", "Product type not found.");
      return res.redirect((req.adminPrefix || "") + "/product-types");
    }
    res.render("admin/product-types/form", {
      title: "Edit Product Type",
      productType: toPlain(productType),
      isEdit: true,
    });
  },

  async update(req, res) {
    const { id } = req.params;
    const productType = await productTypeService.findById(id);
    if (!productType) {
      res.setFlash("error", "Product type not found.");
      return res.redirect((req.adminPrefix || "") + "/product-types");
    }
    const slugVal = req.body.slug ? String(req.body.slug).trim() : slugify(req.body.name);
    const result = validateProductType(req.body, slugVal);
    if (!result.ok) {
      return res.status(400).render("admin/product-types/form", {
        title: "Edit Product Type",
        productType: { id, name: req.body.name, slug: slugVal },
        isEdit: true,
        error: result.errors[0].message,
      });
    }
    const existing = await productTypeService.findBySlug(result.data.slug);
    if (existing && String(existing.id) !== String(id)) {
      return res.status(400).render("admin/product-types/form", {
        title: "Edit Product Type",
        productType: { id, name: req.body.name, slug: slugVal },
        isEdit: true,
        error: "A product type with this slug already exists.",
      });
    }
    await productTypeService.update(id, result.data);
    res.setFlash("success", "Product type updated.");
    res.redirect((req.adminPrefix || "") + "/product-types");
  },

  async delete(req, res) {
    const result = await productTypeService.delete(req.params.id);
    if (result.deleted) res.setFlash("success", "Product type deleted.");
    else res.setFlash("error", result.error || "Product type not found.");
    res.redirect((req.adminPrefix || "") + "/product-types");
  },
};
