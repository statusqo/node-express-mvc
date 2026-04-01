const menuRepo = require("../repos/menu.repo");

/**
 * Raw Sequelize rows may use camelCase or snake_case depending on dialect/options.
 */
function normalizeMenuItemRow(row) {
  if (!row || typeof row !== "object") return row;
  const parentId =
    row.parentId != null ? row.parentId : row.parent_id != null ? row.parent_id : null;
  return { ...row, parentId };
}

/**
 * Builds a tree structure from flat array of menu items (no depth limit).
 * Deduplicates by id to avoid duplicate entries from malformed data.
 */
function buildMenuTree(items, parentId = null, seenIds = new Set()) {
  const branch = [];
  for (const item of items.map(normalizeMenuItemRow)) {
    if (seenIds.has(item.id)) continue;
    const itemParentId = item.parentId;
    if (itemParentId === parentId || (itemParentId === null && parentId === null)) {
      seenIds.add(item.id);
      const children = buildMenuTree(items, item.id, seenIds);
      if (children.length) {
        item.children = children;
      }
      branch.push(item);
    }
  }
  return branch;
}

module.exports = {
  /**
   * Get menu tree for a single menu by slug
   */
  async getMenuTree(menuSlug) {
    const menu = await menuRepo.findMenuBySlug(menuSlug);
    if (!menu || !menu.active) return [];
    const items = await menuRepo.findMenuItemsByMenuId(menu.id, {
      where: { active: true },
      raw: true,
    });
    return buildMenuTree(items);
  },

  // --- Admin CRUD (pass-through to repo) ---
  async findAllMenus(options = {}) {
    return await menuRepo.findAllMenus(options);
  },

  async findMenuById(id, options = {}) {
    return await menuRepo.findMenuById(id, options);
  },

  async findMenuBySlug(slug, options = {}) {
    return await menuRepo.findMenuBySlug(slug, options);
  },

  async createMenu(data, options = {}) {
    return await menuRepo.createMenu(data, options);
  },

  async updateMenu(id, data, options = {}) {
    return await menuRepo.updateMenu(id, data, options);
  },

  async deleteMenu(id, options = {}) {
    return await menuRepo.deleteMenu(id, options);
  },

  async countMenuItems(menuId, options = {}) {
    return await menuRepo.countMenuItems(menuId, options);
  },

  async findMenuItemsByMenuId(menuId, options = {}) {
    return await menuRepo.findMenuItemsByMenuId(menuId, options);
  },

  async findMenuItemById(id, options = {}) {
    return await menuRepo.findMenuItemById(id, options);
  },

  async createMenuItem(data, options = {}) {
    return await menuRepo.createMenuItem(data, options);
  },

  async updateMenuItem(id, data, options = {}) {
    return await menuRepo.updateMenuItem(id, data, options);
  },

  async deleteMenuItem(id, options = {}) {
    return await menuRepo.deleteMenuItem(id, options);
  },

  /**
   * Get all active menus as trees, keyed by slug. Used by layout middleware.
   */
  async getAllMenusForLayout() {
    const menus = await menuRepo.findAllMenus({
      where: { active: true },
      order: [["order", "ASC"]],
      raw: true,
    });
    const result = {};
    for (const menu of menus) {
      const items = await menuRepo.findMenuItemsByMenuId(menu.id, {
        where: { active: true },
        raw: true,
      });
      result[menu.slug] = buildMenuTree(items);
    }
    return result;
  },
};
