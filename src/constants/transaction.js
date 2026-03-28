/**
 * Transaction-related constants.
 */

const TRANSACTION_STATUS_LIST = ["pending", "success", "failed", "refunded"];

const TRANSACTION_STATUS = Object.fromEntries(TRANSACTION_STATUS_LIST.map((s) => [s.toUpperCase(), s]));

module.exports = {
  TRANSACTION_STATUS_LIST,
  TRANSACTION_STATUS,
};
