/**
 * Admin application settings hub (integrations, app-wide options).
 */
const storeSettingService = require("../../services/storeSetting.service");

async function index(req, res) {
  const checkoutVatEnabled = await storeSettingService.isCheckoutVatEnabled();
  res.render("admin/settings/index", {
    title: "Settings",
    adminBackUrl: (req.adminPrefix || "") + "/",
    checkoutVatEnabled,
  });
}

async function updateMoreSettings(req, res) {
  const on = req.body.checkoutVatEnabled === "1" || req.body.checkoutVatEnabled === "on";
  await storeSettingService.setCheckoutVatEnabled(on);
  res.setFlash("success", "Settings saved.");
  res.redirect((req.adminPrefix || "") + "/settings");
}

module.exports = { index, updateMoreSettings };
