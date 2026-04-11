const { Menu, MenuItem } = require("../models");

module.exports = {
  // --- Menu ---
  async findAllMenus(options = {}) {
    return await Menu.findAll(options);
  },

  async findMenuById(id, options = {}) {
    return await Menu.findByPk(id, options);
  },

  async findMenuBySlug(slug, options = {}) {
    return await Menu.findOne({ where: { slug }, ...options });
  },

  async createMenu(data, options = {}) {
    return await Menu.create(data, options);
  },

  async updateMenu(id, data, options = {}) {
    const menu = await Menu.findByPk(id, options);
    if (!menu) return null;
    return await menu.update(data, options);
  },

  async deleteMenu(id, options = {}) {
    const menu = await Menu.findByPk(id, options);
    if (!menu) return { deleted: false, error: "Menu not found." };
    try {
      await menu.destroy(options);
      return { deleted: true };
    } catch (err) {
      if (err.name === "SequelizeForeignKeyConstraintError") {
        return { deleted: false, error: "Cannot delete: this menu is referenced by other records." };
      }
      throw err;
    }
  },

  async countMenuItems(menuId, options = {}) {
    return await MenuItem.count({ where: { menuId }, ...options });
  },

  // --- MenuItem ---
  async findAllMenuItems(options = {}) {
    return await MenuItem.findAll(options);
  },

  async findMenuItemsByMenuId(menuId, options = {}) {
    const { where: optWhere, ...rest } = options;
    return await MenuItem.findAll({
      where: { menuId, ...(optWhere || {}) },
      order: [["order", "ASC"]],
      ...rest,
    });
  },

  async findMenuItemById(id, options = {}) {
    return await MenuItem.findByPk(id, options);
  },

  async createMenuItem(data, options = {}) {
    return await MenuItem.create(data, options);
  },

  async updateMenuItem(id, data, options = {}) {
    const item = await MenuItem.findByPk(id, options);
    if (!item) return null;
    return await item.update(data, options);
  },

  async deleteMenuItem(id, options = {}) {
    const item = await MenuItem.findByPk(id, options);
    if (!item) return { deleted: false, error: "Menu item not found." };
    try {
      await item.destroy(options);
      return { deleted: true };
    } catch (err) {
      if (err.name === "SequelizeForeignKeyConstraintError") {
        return { deleted: false, error: "Cannot delete: this menu item is referenced by other records." };
      }
      throw err;
    }
  },
};
