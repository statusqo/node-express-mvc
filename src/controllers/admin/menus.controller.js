const menuService = require("../../services/menu.service");
const { validateMenu } = require("../../validators/menu.schema");

module.exports = {
  async index(req, res) {
    const menus = await menuService.findAllMenus({ order: [["order", "ASC"]] });
    const menusWithCount = await Promise.all(
      (menus || []).map(async (m) => {
        const plain = m.get ? m.get({ plain: true }) : m;
        const count = await menuService.countMenuItems(plain.id);
        return { ...plain, itemCount: count };
      })
    );
    res.render("admin/menus/index", { title: "Menus", menusList: menusWithCount });
  },

  async newForm(req, res) {
    res.render("admin/menus/form", { title: "New Menu", menu: null, isEdit: false });
  },

  async create(req, res) {
    const result = validateMenu(req.body);
    if (!result.ok) {
      return res.status(400).render("admin/menus/form", {
        title: "New Menu",
        menu: { ...req.body, active: req.body.active === "on", order: req.body.order },
        isEdit: false,
        error: result.errors[0].message,
      });
    }
    const existing = await menuService.findMenuBySlug(result.data.slug);
    if (existing) {
      return res.status(400).render("admin/menus/form", {
        title: "New Menu",
        menu: { ...req.body, active: req.body.active === "on", order: req.body.order },
        isEdit: false,
        error: "A menu with this slug already exists.",
      });
    }
    await menuService.createMenu(result.data);
    res.setFlash("success", "Menu created.");
    res.redirect((req.adminPrefix || "") + "/menus");
  },

  async editForm(req, res) {
    const menu = await menuService.findMenuById(req.params.id);
    if (!menu) {
      res.setFlash("error", "Menu not found.");
      return res.redirect((req.adminPrefix || "") + "/menus");
    }
    res.render("admin/menus/form", {
      title: "Edit Menu",
      menu: menu.get ? menu.get({ plain: true }) : menu,
      isEdit: true,
    });
  },

  async update(req, res) {
    const { id } = req.params;
    const menu = await menuService.findMenuById(id);
    if (!menu) {
      res.setFlash("error", "Menu not found.");
      return res.redirect((req.adminPrefix || "") + "/menus");
    }
    const result = validateMenu(req.body);
    if (!result.ok) {
      return res.status(400).render("admin/menus/form", {
        title: "Edit Menu",
        menu: { id, ...req.body, active: req.body.active === "on", order: req.body.order },
        isEdit: true,
        error: result.errors[0].message,
      });
    }
    const existing = await menuService.findMenuBySlug(result.data.slug);
    if (existing && String(existing.id) !== String(id)) {
      return res.status(400).render("admin/menus/form", {
        title: "Edit Menu",
        menu: { id, ...req.body, active: req.body.active === "on", order: req.body.order },
        isEdit: true,
        error: "A menu with this slug already exists.",
      });
    }
    await menuService.updateMenu(id, result.data);
    res.setFlash("success", "Menu updated.");
    res.redirect((req.adminPrefix || "") + "/menus");
  },

  async delete(req, res) {
    const result = await menuService.deleteMenu(req.params.id);
    if (result.deleted) res.setFlash("success", "Menu deleted.");
    else res.setFlash("error", result.error || "Menu not found.");
    res.redirect((req.adminPrefix || "") + "/menus");
  },
};
