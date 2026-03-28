/**
 * Product constants. Source of truth for valid unit of measure and weight unit values.
 * Used by Product model, product.schema, and product.repo.
 */

const UNIT_OF_MEASURE_LIST = ["kom", "h", "mj", "usl", "god"];
const UNIT_OF_MEASURE = Object.fromEntries(UNIT_OF_MEASURE_LIST.map((s) => [s.toUpperCase(), s]));

const WEIGHT_UNIT_LIST = ["g", "kg"];
const WEIGHT_UNIT = Object.fromEntries(WEIGHT_UNIT_LIST.map((s) => [s.toUpperCase(), s]));

module.exports = {
  UNIT_OF_MEASURE_LIST,
  UNIT_OF_MEASURE,
  WEIGHT_UNIT_LIST,
  WEIGHT_UNIT,
};
