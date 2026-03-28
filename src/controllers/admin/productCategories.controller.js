const productCategoryService = require("../../services/productCategory.service");
const { validateProductCategory } = require("../../validators/productCategory.schema");

function slugify(s) {
  if (!s || typeof s !== "string") return "";
  return s.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function toPlain(obj) {
  return obj && typeof obj.get === "function" ? obj.get({ plain: true }) : obj;
}

module.exports = {
  async index(req, res) {
    const categories = await productCategoryService.findAll();
    const list = (categories || []).map(toPlain);
    res.render("admin/product-categories/index", { title: "Product Categories", productCategories: list });
  },

  async newForm(req, res) {
    res.render("admin/product-categories/form", {
      title: "New Product Category",
      productCategory: null,
      isEdit: false,
    });
  },

  async create(req, res) {
    const slugVal = req.body.slug ? String(req.body.slug).trim() : slugify(req.body.name);
    const result = validateProductCategory(req.body, slugVal);
    if (!result.ok) {
      return res.status(400).render("admin/product-categories/form", {
        title: "New Product Category",
        productCategory: { name: req.body.name, slug: slugVal, kpdCode: req.body.kpdCode || "" },
        isEdit: false,
        error: result.errors[0].message,
      });
    }
    const existing = await productCategoryService.findBySlug(result.data.slug);
    if (existing) {
      return res.status(400).render("admin/product-categories/form", {
        title: "New Product Category",
        productCategory: { name: req.body.name, slug: slugVal, kpdCode: req.body.kpdCode || "" },
        isEdit: false,
        error: "A product category with this slug already exists.",
      });
    }
    await productCategoryService.create(result.data);
    res.setFlash("success", "Product category created.");
    res.redirect((req.adminPrefix || "") + "/product-categories");
  },

  async editForm(req, res) {
    const category = await productCategoryService.findById(req.params.id);
    if (!category) {
      res.setFlash("error", "Product category not found.");
      return res.redirect((req.adminPrefix || "") + "/product-categories");
    }
    res.render("admin/product-categories/form", {
      title: "Edit Product Category",
      productCategory: toPlain(category),
      isEdit: true,
    });
  },

  async update(req, res) {
    const { id } = req.params;
    const category = await productCategoryService.findById(id);
    if (!category) {
      res.setFlash("error", "Product category not found.");
      return res.redirect((req.adminPrefix || "") + "/product-categories");
    }
    const slugVal = req.body.slug ? String(req.body.slug).trim() : slugify(req.body.name);
    const result = validateProductCategory(req.body, slugVal);
    if (!result.ok) {
      return res.status(400).render("admin/product-categories/form", {
        title: "Edit Product Category",
        productCategory: { id, name: req.body.name, slug: slugVal, kpdCode: req.body.kpdCode || "" },
        isEdit: true,
        error: result.errors[0].message,
      });
    }
    const existing = await productCategoryService.findBySlug(result.data.slug);
    if (existing && String(existing.id) !== String(id)) {
      return res.status(400).render("admin/product-categories/form", {
        title: "Edit Product Category",
        productCategory: { id, name: req.body.name, slug: slugVal, kpdCode: req.body.kpdCode || "" },
        isEdit: true,
        error: "A product category with this slug already exists.",
      });
    }
    await productCategoryService.update(id, result.data);
    res.setFlash("success", "Product category updated.");
    res.redirect((req.adminPrefix || "") + "/product-categories");
  },

  async delete(req, res) {
    const deleted = await productCategoryService.delete(req.params.id);
    if (deleted) res.setFlash("success", "Product category deleted.");
    else res.setFlash("error", "Product category not found.");
    res.redirect((req.adminPrefix || "") + "/product-categories");
  },
};
