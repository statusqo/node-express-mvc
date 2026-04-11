"use strict";

const ORDER_HISTORY_EVENT = {
  // Payment lifecycle
  PAYMENT_FINALIZED: "payment_finalized",
  // Full-order refund (cancel & refund, approve full refund request, event cancellation full refund)
  PAYMENT_REFUNDED: "payment_refunded",
  // Partial refund: single seat (cancel registration) or event-portion refund on multi-event order
  PARTIAL_REFUND_ISSUED: "partial_refund_issued",

  // Fulfillment
  CONFIRMATION_EMAIL_SENT: "confirmation_email_sent",
  ZOOM_SYNC_COMPLETED: "zoom_sync_completed",
  FULFILLMENT_STATUS_CHANGED: "fulfillment_status_changed",

  // Refund request lifecycle (customer-initiated)
  REFUND_REQUESTED: "refund_requested",
  REFUND_REQUEST_APPROVED: "refund_request_approved",
  REFUND_REQUEST_REJECTED: "refund_request_rejected",

  // Admin actions
  ORDER_CANCELLED: "order_cancelled",
  ORDER_UPDATED: "order_updated",

  // Retries
  POST_COMMIT_RETRIED: "post_commit_retried",
};

const ORDER_HISTORY_EVENT_LIST = Object.values(ORDER_HISTORY_EVENT);

module.exports = { ORDER_HISTORY_EVENT, ORDER_HISTORY_EVENT_LIST };
