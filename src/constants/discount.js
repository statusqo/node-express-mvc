/**
 * Discount constants. Source of truth for discount types.
 * Used by Discount model, discount.repo, discount.service, and controllers.
 */

const DISCOUNT_TYPE_LIST = ["percentage", "fixed_amount"];
const DISCOUNT_TYPE = Object.fromEntries(DISCOUNT_TYPE_LIST.map((s) => [s.toUpperCase(), s]));

module.exports = {
  DISCOUNT_TYPE_LIST,
  DISCOUNT_TYPE,
};
