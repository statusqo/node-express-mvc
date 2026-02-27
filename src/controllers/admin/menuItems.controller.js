const menuService = require("../../services/menu.service");
const { validateMenuItem } = require("../../validators/menuItem.schema");

module.exports = {
  async index(req, res) {
    const menus = await menuService.findAllMenus({ order: [["order", "ASC"]] });
    const selectedMenuSlug = req.query.menu || (menus[0] && menus[0].slug) || null;
    let selectedMenu = null;
    let items = [];

    if (selectedMenuSlug) {
      selectedMenu = await menuService.findMenuBySlug(selectedMenuSlug);
      if (selectedMenu) {
        const plain = selectedMenu.get ? selectedMenu.get({ plain: true }) : selectedMenu;
        selectedMenu = plain;
        // Build tree then flatten for table display (one row per item, with depth)
        const tree = await menuService.getMenuTree(selectedMenuSlug);
        function flattenWithDepth(list, depth = 0) {
          const result = [];
          for (const item of list) {
            const { children, ...rest } = item;
            result.push({ ...rest, depth });
            if (children && children.length) {
              result.push(...flattenWithDepth(children, depth + 1));
            }
          }
          return result;
        }
        items = flattenWithDepth(tree);
      }
    }

    res.render("admin/menu-items/index", {
      title: "Menu Items",
      menusList: menus || [],
      selectedMenu,
      items,
    });
  },

  async newForm(req, res) {
    const menus = await menuService.findAllMenus({ order: [["order", "ASC"]] });
    const menuId = req.query.menu;
    let resolvedMenuId = null;
    let menuSlug = null;
    if (menuId) {
      const menu = await menuService.findMenuById(menuId);
      if (menu) {
        resolvedMenuId = menu.id;
        menuSlug = menu.slug;
      } else {
        const bySlug = await menuService.findMenuBySlug(menuId);
        if (bySlug) {
          resolvedMenuId = bySlug.id;
          menuSlug = bySlug.slug;
        }
      }
    }
    if (!resolvedMenuId && menus[0]) {
      resolvedMenuId = menus[0].id;
      menuSlug = menus[0].slug;
    }
    let parentOptions = [];
    if (resolvedMenuId) {
      const items = await menuService.findMenuItemsByMenuId(resolvedMenuId);
      parentOptions = items.map((i) => (i.get ? i.get({ plain: true }) : i));
    }
    res.render("admin/menu-items/form", {
      title: "New Menu Item",
      menuItem: null,
      menusList: menus || [],
      menuId: resolvedMenuId,
      menuSlug,
      parentOptions,
      isEdit: false,
    });
  },

  async create(req, res) {
    const result = validateMenuItem(req.body);
    if (!result.ok) {
      const menus = await menuService.findAllMenus({ order: [["order", "ASC"]] });
      let parentOptions = [];
      if (req.body.menuId) {
        const items = await menuService.findMenuItemsByMenuId(req.body.menuId);
        parentOptions = items.map((i) => (i.get ? i.get({ plain: true }) : i));
      }
      return res.status(400).render("admin/menu-items/form", {
        title: "New Menu Item",
        menuItem: { ...req.body, active: req.body.active === "on" },
        menusList: menus || [],
        menuId: req.body.menuId,
        parentOptions,
        isEdit: false,
        error: result.errors[0].message,
      });
    }
    const data = result.data;
    if (!data.menuId) {
      return res.status(400).redirect((req.adminPrefix || "") + "/menu-items/new?error=Menu+is+required");
    }
    await menuService.createMenuItem(data);
    res.setFlash("success", "Menu item created.");
    const menu = await menuService.findMenuById(data.menuId);
    const menuSlug = menu ? menu.slug : null;
    res.redirect((req.adminPrefix || "") + "/menu-items?menu=" + (menuSlug || data.menuId));
  },

  async editForm(req, res) {
    const item = await menuService.findMenuItemById(req.params.id);
    if (!item) {
      res.setFlash("error", "Menu item not found.");
      return res.redirect((req.adminPrefix || "") + "/menu-items");
    }
    const plain = item.get ? item.get({ plain: true }) : item;
    const menus = await menuService.findAllMenus({ order: [["order", "ASC"]] });
    const menu = await menuService.findMenuById(plain.menuId);
    const menuSlug = menu ? menu.slug : null;
    const parentOptions = (await menuService.findMenuItemsByMenuId(plain.menuId))
      .filter((i) => i.id !== plain.id)
      .map((i) => (i.get ? i.get({ plain: true }) : i));
    res.render("admin/menu-items/form", {
      title: "Edit Menu Item",
      menuItem: plain,
      menusList: menus || [],
      menuId: plain.menuId,
      menuSlug,
      parentOptions,
      isEdit: true,
    });
  },

  async update(req, res) {
    const { id } = req.params;
    const item = await menuService.findMenuItemById(id);
    if (!item) {
      res.setFlash("error", "Menu item not found.");
      return res.redirect((req.adminPrefix || "") + "/menu-items");
    }
    const result = validateMenuItem(req.body);
    if (!result.ok) {
      const plain = item.get ? item.get({ plain: true }) : item;
      const menus = await menuService.findAllMenus({ order: [["order", "ASC"]] });
      const parentOptions = (await menuService.findMenuItemsByMenuId(plain.menuId))
        .filter((i) => i.id !== id)
        .map((i) => (i.get ? i.get({ plain: true }) : i));
      return res.status(400).render("admin/menu-items/form", {
        title: "Edit Menu Item",
        menuItem: { id, ...req.body, active: req.body.active === "on" },
        menusList: menus || [],
        menuId: plain.menuId,
        parentOptions,
        isEdit: true,
        error: result.errors[0].message,
      });
    }
    const data = result.data;
    const plain = item.get ? item.get({ plain: true }) : item;
    const resolvedMenuId = data.menuId || plain.menuId;
    await menuService.updateMenuItem(id, { ...data, menuId: resolvedMenuId });
    res.setFlash("success", "Menu item updated.");
    const menu = await menuService.findMenuById(resolvedMenuId);
    const menuSlug = menu ? menu.slug : null;
    res.redirect((req.adminPrefix || "") + "/menu-items?menu=" + (menuSlug || resolvedMenuId));
  },

  async delete(req, res) {
    const item = await menuService.findMenuItemById(req.params.id);
    const menuId = item ? item.menuId : null;
    const deleted = await menuService.deleteMenuItem(req.params.id);
    if (deleted) res.setFlash("success", "Menu item deleted.");
    else res.setFlash("error", "Menu item not found.");
    const menu = menuId ? await menuService.findMenuById(menuId) : null;
    const slug = menu ? menu.slug : null;
    res.redirect((req.adminPrefix || "") + "/menu-items?menu=" + (slug || menuId || ""));
  },
};
