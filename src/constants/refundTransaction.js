/**
 * Refund transaction constants.
 */

const REFUND_TRANSACTION_STATUS_LIST = ["pending", "succeeded", "failed", "cancelled"];
const REFUND_TRANSACTION_SCOPE_LIST = ["full_order", "line_quantity", "event_attendee"];

const REFUND_TRANSACTION_STATUS = Object.fromEntries(
  REFUND_TRANSACTION_STATUS_LIST.map((s) => [s.toUpperCase(), s])
);
const REFUND_TRANSACTION_SCOPE = Object.fromEntries(
  REFUND_TRANSACTION_SCOPE_LIST.map((s) => [s.toUpperCase(), s])
);

module.exports = {
  REFUND_TRANSACTION_STATUS_LIST,
  REFUND_TRANSACTION_SCOPE_LIST,
  REFUND_TRANSACTION_STATUS,
  REFUND_TRANSACTION_SCOPE,
};
