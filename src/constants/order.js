/**
 * Order status constants. Source of truth for valid payment and fulfillment statuses.
 * Used by Order model, order.repo, order.service, and controllers.
 */

const PAYMENT_STATUS_LIST = ["pending", "paid", "failed", "refunded", "voided"];
const FULFILLMENT_STATUS_LIST = ["pending", "processing", "shipped", "delivered", "refund_requested", "refunded", "cancelled", "returned"];
const ORDER_SOURCE_LIST = ["cart", "event"];

const PAYMENT_STATUS = Object.fromEntries(PAYMENT_STATUS_LIST.map((s) => [s.toUpperCase(), s]));
const FULFILLMENT_STATUS = Object.fromEntries(FULFILLMENT_STATUS_LIST.map((s) => [s.toUpperCase(), s]));
const ORDER_SOURCE = Object.fromEntries(ORDER_SOURCE_LIST.map((s) => [s.toUpperCase(), s]));

module.exports = {
  PAYMENT_STATUS_LIST,
  FULFILLMENT_STATUS_LIST,
  ORDER_SOURCE_LIST,
  PAYMENT_STATUS,
  FULFILLMENT_STATUS,
  ORDER_SOURCE,
};
