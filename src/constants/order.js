/**
 * Order status constants. Source of truth for valid payment and fulfillment statuses.
 * Used by Order model, order.repo, order.service, and controllers.
 */

const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded"];
const FULFILLMENT_STATUSES = ["pending", "processing", "shipped", "delivered", "refund_requested", "refunded", "partially_refunded", "cancelled", "returned"];

const PAYMENT_STATUS = Object.fromEntries(PAYMENT_STATUSES.map((s) => [s.toUpperCase(), s]));
const FULFILLMENT_STATUS = Object.fromEntries(FULFILLMENT_STATUSES.map((s) => [s.toUpperCase(), s]));

module.exports = {
  PAYMENT_STATUSES,
  FULFILLMENT_STATUSES,
  PAYMENT_STATUS,
  FULFILLMENT_STATUS,
};
