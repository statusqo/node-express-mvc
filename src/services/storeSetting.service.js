const storeSettingRepo = require("../repos/storeSetting.repo");
const { STORE_SETTING_KEYS, DEFAULT_CHECKOUT_VAT_ENABLED } = require("../constants/storeSettings");

function parseBooleanSetting(raw, defaultValue) {
  if (raw == null || raw === "") return defaultValue;
  const s = String(raw).trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
  if (s === "0" || s === "false" || s === "no" || s === "off") return false;
  return defaultValue;
}

async function isCheckoutVatEnabled(options = {}) {
  try {
    const row = await storeSettingRepo.getByKey(STORE_SETTING_KEYS.CHECKOUT_VAT_ENABLED, options);
    const raw = row && row.value != null ? row.value : null;
    return parseBooleanSetting(raw, DEFAULT_CHECKOUT_VAT_ENABLED);
  } catch (e) {
    const parent = e && e.parent;
    const msg = String((parent && parent.message) || e.message || "");
    if (
      e.name === "SequelizeDatabaseError" &&
      (/no such table/i.test(msg) || /relation .*store_settings/i.test(msg) || msg.includes("store_settings"))
    ) {
      return DEFAULT_CHECKOUT_VAT_ENABLED;
    }
    throw e;
  }
}

async function setCheckoutVatEnabled(enabled, options = {}) {
  await storeSettingRepo.setByKey(
    STORE_SETTING_KEYS.CHECKOUT_VAT_ENABLED,
    enabled ? "1" : "0",
    options
  );
}

module.exports = {
  isCheckoutVatEnabled,
  setCheckoutVatEnabled,
};
