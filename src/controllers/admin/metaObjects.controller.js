const metaObjectService = require("../../services/metaObject.service");
const { validateMetaObject, parseDefinitionPairs } = require("../../validators/metaObject.schema");

function slugify(s) {
  if (!s || typeof s !== "string") return "";
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

module.exports = {
  /** GET /admin/api/meta-objects — JSON list for meta object picker (product form). */
  async listApi(req, res) {
    const metaObjects = await metaObjectService.findAllForAdmin();
    const list = (metaObjects || []).map((mo) => {
      const plain = mo.get ? mo.get({ plain: true }) : mo;
      const definitionPairs = parseDefinitionPairs(plain.definition);
      return {
        id: plain.id,
        name: plain.name || "",
        type: plain.type || "",
        slug: plain.slug || "",
        definitionPairs,
      };
    });
    res.json({ metaObjects: list });
  },

  async index(req, res) {
    const metaObjects = await metaObjectService.findAllForAdmin();
    res.render("admin/meta-objects/index", { title: "Meta Objects", metaObjects: metaObjects || [] });
  },

  async newForm(req, res) {
    res.render("admin/meta-objects/form", {
      title: "New Meta Object",
      metaObject: null,
      definitionPairs: [],
      isEdit: false,
    });
  },

  async create(req, res) {
    const { name, slug, type, definition, active } = req.body;
    const slugVal = slug ? String(slug).trim() : slugify(name);
    const bodyForValidation = {
      name: name ? String(name).trim() : "",
      slug: slugVal || slugify(name),
      type: type || "",
      definition: definition || "[]",
      active,
    };
    const parsed = validateMetaObject(bodyForValidation);
    if (!parsed.ok) {
      res.setFlash("error", "Please fix the form errors.");
      const definitionPairs = parseDefinitionPairs(definition);
      return res.status(400).render("admin/meta-objects/form", {
        title: "New Meta Object",
        metaObject: { name, slug: slugVal, type, definition, active: active === "on" },
        definitionPairs,
        errors: parsed.errors,
        isEdit: false,
      });
    }
    await metaObjectService.create(parsed.data);
    res.setFlash("success", "Meta object created.");
    res.redirect((req.adminPrefix || "") + "/meta-objects");
  },

  async editForm(req, res) {
    const metaObject = await metaObjectService.findById(req.params.id);
    if (!metaObject) {
      res.setFlash("error", "Meta object not found.");
      return res.redirect((req.adminPrefix || "") + "/meta-objects");
    }
    const plain = metaObject.get ? metaObject.get({ plain: true }) : metaObject;
    const definitionPairs = parseDefinitionPairs(plain.definition);
    res.render("admin/meta-objects/form", {
      title: "Edit Meta Object",
      metaObject: plain,
      definitionPairs,
      isEdit: true,
    });
  },

  async update(req, res) {
    const { id } = req.params;
    const metaObject = await metaObjectService.findById(id);
    if (!metaObject) {
      res.setFlash("error", "Meta object not found.");
      return res.redirect((req.adminPrefix || "") + "/meta-objects");
    }
    const { name, slug, type, definition, active } = req.body;
    const slugVal = slug ? String(slug).trim() : slugify(name);
    const bodyForValidation = {
      name: name ? String(name).trim() : "",
      slug: slugVal || slugify(name),
      type: type || "",
      definition: definition || "[]",
      active,
    };
    const parsed = validateMetaObject(bodyForValidation);
    if (!parsed.ok) {
      res.setFlash("error", "Please fix the form errors.");
      const definitionPairs = parseDefinitionPairs(definition);
      return res.status(400).render("admin/meta-objects/form", {
        title: "Edit Meta Object",
        metaObject: { id, name, slug: slugVal, type, definition, active: active === "on" },
        definitionPairs,
        errors: parsed.errors,
        isEdit: true,
      });
    }
    await metaObjectService.update(id, parsed.data);
    res.setFlash("success", "Meta object updated.");
    res.redirect((req.adminPrefix || "") + "/meta-objects");
  },

  async delete(req, res) {
    const result = await metaObjectService.delete(req.params.id);
    if (result.deleted) res.setFlash("success", "Meta object deleted.");
    else res.setFlash("error", result.error || "Meta object not found.");
    res.redirect((req.adminPrefix || "") + "/meta-objects");
  },
};
