const { sequelize } = require("../db");
const refundRequestRepo = require("../repos/refundRequest.repo");
const orderRepo = require("../repos/order.repo");
const transactionRepo = require("../repos/transaction.repo");
const stripeGateway = require("../gateways/stripe.gateway");
const logger = require("../config/logger");
const refundTransactionRepo = require("../repos/refundTransaction.repo");
const orderService = require("./order.service");
const { TRANSACTION_STATUS } = require("../constants/transaction");
const { FULFILLMENT_STATUS } = require("../constants/order");
const { REFUND_REQUEST_STATUS } = require("../constants/refundRequest");
const { REFUND_TRANSACTION_STATUS, REFUND_TRANSACTION_SCOPE } = require("../constants/refundTransaction");

const PENDING = REFUND_REQUEST_STATUS.PENDING;
const APPROVED = REFUND_REQUEST_STATUS.APPROVED;
const REJECTED = REFUND_REQUEST_STATUS.REJECTED;

const MONEY_EPS = 0.0001;

/**
 * Create a refund request for an order. Caller must ensure order belongs to user/session.
 * @param {string} orderId
 * @param {string|null} requestedByUserId
 * @param {string} [reason]
 * @returns {Promise<RefundRequest>}
 */
async function createRefundRequest(orderId, requestedByUserId, reason = null) {
  const order = await orderRepo.findById(orderId);
  if (!order) {
    const err = new Error("Order not found.");
    err.status = 404;
    throw err;
  }
  if (!orderService.isPaymentStatusRefundable(order.paymentStatus)) {
    const err = new Error("Only paid or partially refunded orders can request a refund.");
    err.status = 400;
    throw err;
  }
  const remaining = await orderService.getRemainingRefundableAmount(orderId);
  if (remaining === null || remaining <= MONEY_EPS) {
    const err = new Error("No refundable balance remains for this order.");
    err.status = 400;
    throw err;
  }
  if (order.fulfillmentStatus !== "delivered") {
    const err = new Error("Refund can only be requested for delivered orders.");
    err.status = 400;
    throw err;
  }
  const existingPending = await refundRequestRepo.findPendingByOrder(orderId);
  if (existingPending) {
    const err = new Error("A refund request is already pending for this order.");
    err.status = 400;
    throw err;
  }

  let request;
  await sequelize.transaction(async (t) => {
    request = await refundRequestRepo.create({
      orderId,
      status: PENDING,
      reason: reason && String(reason).trim() ? String(reason).trim() : null,
      requestedByUserId: requestedByUserId || null,
    }, { transaction: t });
    await orderRepo.update(orderId, { fulfillmentStatus: FULFILLMENT_STATUS.REFUND_REQUESTED }, { transaction: t });
  });
  logger.info("Refund request created", { requestId: request.id, orderId, requestedByUserId });
  return request;
}

/**
 * List all pending refund requests (admin).
 * @param {Object} options - Sequelize include options (e.g. Order, User)
 */
async function findPendingRefundRequests(options = {}) {
  return await refundRequestRepo.findPending(options);
}

/**
 * List refund requests for admin with optional status filter. Includes Order for display.
 */
async function findRefundRequestsForAdmin(filters = {}, options = {}) {
  return await refundRequestRepo.findAllWithOrder(filters, options);
}

/**
 * Get refund requests for an order (admin or for display).
 */
async function findByOrder(orderId, options = {}) {
  return await refundRequestRepo.findByOrder(orderId, options);
}

/**
 * Get a single status per order for display: "pending" | "approved" | "rejected" | null.
 * Pending takes precedence, then approved, then rejected.
 * @param {string[]} orderIds
 * @returns {Promise<Record<string, string>>} map of orderId -> status
 */
async function getRefundRequestStatusByOrderIds(orderIds) {
  if (!orderIds || orderIds.length === 0) return {};
  const list = await refundRequestRepo.findByOrderIds(orderIds, { raw: true });
  const map = {};
  for (const r of list) {
    if (!r.orderId) continue;
    const current = map[r.orderId];
    if (!current || r.status === PENDING) map[r.orderId] = r.status;
    else if (current !== PENDING && r.status === APPROVED) map[r.orderId] = APPROVED;
    else if (current !== PENDING && current !== APPROVED && r.status === REJECTED) map[r.orderId] = REJECTED;
  }
  return map;
}

/**
 * Approve a refund request: call Stripe createRefund, update RefundRequest, transaction, and order.
 * @param {string} requestId
 * @param {string} processedByUserId
 */
async function approveRefundRequest(requestId, processedByUserId) {
  const request = await refundRequestRepo.findById(requestId);
  if (!request) {
    const err = new Error("Refund request not found.");
    err.status = 404;
    throw err;
  }
  if (request.status !== PENDING) {
    const err = new Error("This refund request has already been processed.");
    err.status = 400;
    throw err;
  }

  const order = await orderRepo.findById(request.orderId);
  if (!order) {
    const err = new Error("Order not found.");
    err.status = 404;
    throw err;
  }
  if (!orderService.isPaymentStatusRefundable(order.paymentStatus)) {
    const err = new Error("Order is not in a refundable payment state.");
    err.status = 400;
    throw err;
  }

  const remaining = await orderService.getRemainingRefundableAmount(order.id);
  if (remaining === null || remaining <= MONEY_EPS) {
    const err = new Error("No refundable balance remains for this order.");
    err.status = 400;
    throw err;
  }

  const paymentIntentId = order.stripePaymentIntentId;
  if (!paymentIntentId) {
    const err = new Error("Order has no payment intent; cannot refund.");
    err.status = 400;
    throw err;
  }

  logger.info("Refund approval started", { requestId, orderId: order.id, paymentIntentId, remaining });

  // Call Stripe OUTSIDE the DB transaction — external API calls must not hold a connection open.
  // Registration and Zoom removal are handled separately by the admin via the per-registration cancellation flow.
  logger.info("Issuing Stripe refund for refund approval", { orderId: order.id, paymentIntentId, remaining });
  const transactions = await transactionRepo.findByOrder(order.id);
  const successTx = transactions.find((tx) => tx.gatewayReference === paymentIntentId && tx.status === TRANSACTION_STATUS.SUCCESS);

  let refund;
  try {
    refund = await stripeGateway.createRefund({
      paymentIntentId,
      amountMinor: Math.round(remaining * 100),
      reason: "requested_by_customer",
      metadata: { orderId: String(order.id), refundRequestId: String(requestId), scopeType: REFUND_TRANSACTION_SCOPE.FULL_ORDER },
      idempotencyKey: `refund_request_${requestId}`,
    });
  } catch (e) {
    logger.error("approveRefundRequest: Stripe refund failed", { requestId, orderId: order.id, error: e.message });
    const err = new Error(e.message || "Stripe refund failed.");
    err.status = 502;
    throw err;
  }

  if (refund.status === "failed" || refund.status === "canceled") {
    const err = new Error(`Stripe refund status: ${refund.status}. No changes were recorded — please retry.`);
    err.status = 502;
    throw err;
  }

  const mappedStatus =
    refund.status === "succeeded" ? REFUND_TRANSACTION_STATUS.SUCCEEDED : REFUND_TRANSACTION_STATUS.PENDING;
  const refundMeta = JSON.stringify({ stripeStatus: refund.status });

  // Write RefundTransaction, apply effects, and mark request approved — all in one DB transaction.
  await sequelize.transaction(async (t) => {
    let refundTx = await refundTransactionRepo.findByStripeRefundId(refund.id);
    if (!refundTx) {
      refundTx = await refundTransactionRepo.create({
        orderId: order.id,
        refundRequestId: request.id,
        paymentTransactionId: successTx ? successTx.id : null,
        stripeRefundId: refund.id,
        paymentIntentId,
        amount: remaining,
        currency: order.currency,
        status: mappedStatus,
        scopeType: REFUND_TRANSACTION_SCOPE.FULL_ORDER,
        reason: request.reason || null,
        metadata: refundMeta,
        createdByUserId: processedByUserId || null,
      }, { transaction: t });
    } else {
      await refundTransactionRepo.update(refundTx.id, { status: mappedStatus, metadata: refundMeta }, { transaction: t });
    }
    if (refund.status === "succeeded") {
      await orderService.applyRefundTransactionEffects(refundTx.id, { transaction: t });
    }
    await refundRequestRepo.update(requestId, {
      status: APPROVED,
      processedAt: new Date(),
      processedByUserId,
      stripeRefundId: refund.id,
    }, { transaction: t });
  });

  logger.info("Refund approval complete", { requestId, orderId: order.id, refundStatus: refund.status });
  return await refundRequestRepo.findById(requestId);
}

/**
 * Reject a refund request.
 */
async function rejectRefundRequest(requestId, processedByUserId) {
  const request = await refundRequestRepo.findById(requestId);
  if (!request) {
    const err = new Error("Refund request not found.");
    err.status = 404;
    throw err;
  }
  if (request.status !== PENDING) {
    const err = new Error("This refund request has already been processed.");
    err.status = 400;
    throw err;
  }

  await sequelize.transaction(async (t) => {
    await refundRequestRepo.update(requestId, {
      status: REJECTED,
      processedAt: new Date(),
      processedByUserId,
    }, { transaction: t });
    await orderRepo.update(request.orderId, { fulfillmentStatus: FULFILLMENT_STATUS.DELIVERED }, { transaction: t });
  });
  logger.info("Refund request rejected", { requestId, orderId: request.orderId, processedByUserId });
  return await refundRequestRepo.findById(requestId);
}

module.exports = {
  createRefundRequest,
  findPendingRefundRequests,
  findRefundRequestsForAdmin,
  findByOrder,
  getRefundRequestStatusByOrderIds,
  approveRefundRequest,
  rejectRefundRequest,
};
