/**
 * Discount constants. Source of truth for discount types.
 * Used by Discount model, discount.repo, discount.service, and controllers.
 */

const DISCOUNT_TYPE_LIST = ["percentage", "fixed_amount"];
const DISCOUNT_TYPE = Object.fromEntries(DISCOUNT_TYPE_LIST.map((s) => [s.toUpperCase(), s]));

// Controls which order lines the discount is applied to.
// 'all'      → entire order total (default)
// 'events'   → only event-tied product variant lines
// 'products' → only non-event product variant lines
const DISCOUNT_APPLIES_TO_LIST = ["all", "events", "products"];
const DISCOUNT_APPLIES_TO = Object.fromEntries(DISCOUNT_APPLIES_TO_LIST.map((s) => [s.toUpperCase(), s]));

module.exports = {
  DISCOUNT_TYPE_LIST,
  DISCOUNT_TYPE,
  DISCOUNT_APPLIES_TO_LIST,
  DISCOUNT_APPLIES_TO,
};
