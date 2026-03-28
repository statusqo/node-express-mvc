/**
 * Refund request status constants. Source of truth for valid refund request statuses.
 * Used by RefundRequest model, refundRequest.service, and refundRequest.repo.
 */

const REFUND_REQUEST_STATUS_LIST = ["pending", "approved", "rejected"];

const REFUND_REQUEST_STATUS = Object.fromEntries(REFUND_REQUEST_STATUS_LIST.map((s) => [s.toUpperCase(), s]));

module.exports = {
  REFUND_REQUEST_STATUS_LIST,
  REFUND_REQUEST_STATUS,
};
