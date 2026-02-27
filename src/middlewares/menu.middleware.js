const menuService = require("../services/menu.service");
const logger = require("../config/logger");

async function injectMenus(req, res, next) {
  try {
    if (!res.locals.menus) {
      const menus = await menuService.getAllMenusForLayout();
      res.locals.menus = menus;
    }
  } catch (err) {
    logger.error("Failed to fetch menus", { error: err.message });
    res.locals.menus = {};
  }
  next();
}

module.exports = { injectMenus };
