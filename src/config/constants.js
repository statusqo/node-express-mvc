// shared application constants

// default currency for all prices, orders, and payments. Products cannot be priced
// in any other currency; the admin UI hides any selector and the database column
// is kept for compatibility but always matches this value.
const DEFAULT_CURRENCY = "EUR";

module.exports = {
  DEFAULT_CURRENCY,
};
