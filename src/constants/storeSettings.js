/** Keys for `store_settings` table (namespaced). */
const STORE_SETTING_KEYS = {
  /** When true: show VAT breakdown at checkout and attach Stripe Invoice tax_rates; products should have a tax rate. */
  CHECKOUT_VAT_ENABLED: "checkout.vat_enabled",
};

/** Default when row is missing (preserves prior app behaviour). */
const DEFAULT_CHECKOUT_VAT_ENABLED = true;

module.exports = { STORE_SETTING_KEYS, DEFAULT_CHECKOUT_VAT_ENABLED };
