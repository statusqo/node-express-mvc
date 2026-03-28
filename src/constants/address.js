/**
 * Address label constants. Source of truth for valid address label values.
 * Used by Address model, address.service, and address validator.
 */

const ADDRESS_LABEL_LIST = ["delivery", "billing"];

const ADDRESS_LABEL = Object.fromEntries(ADDRESS_LABEL_LIST.map((s) => [s.toUpperCase(), s]));

module.exports = {
  ADDRESS_LABEL_LIST,
  ADDRESS_LABEL,
};
