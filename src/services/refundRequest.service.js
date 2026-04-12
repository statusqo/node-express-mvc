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
const orderHistoryService = require("./orderHistory.service");
const { ORDER_HISTORY_EVENT } = require("../constants/orderHistory");

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
  orderHistoryService.record(orderId, ORDER_HISTORY_EVENT.REFUND_REQUESTED, {
    success: true,
    meta: { requestId: request.id, requestedByUserId: requestedByUserId || null },
  });
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
 * Approve a refund request: remove Zoom, Stripe refund (or local no-PI refund), then one DB transaction.
 * RefundRequest is marked approved only when the refund succeeds (or no-PI path); if Stripe returns pending,
 * the request stays pending so admin can retry Approve; webhooks complete approval when Stripe succeeds.
 * @param {string} requestId
 * @param {string} processedByUserId
 */
async function approveRefundRequest(requestId, processedByUserId, orderId) {
  const request = await refundRequestRepo.findById(requestId);
  if (!request) {
    const err = new Error("Refund request not found.");
    err.status = 404;
    throw err;
  }
  if (orderId && String(request.orderId) !== String(orderId)) {
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
  const transactions = await transactionRepo.findByOrder(order.id);
  const successTx = paymentIntentId
    ? transactions.find((tx) => tx.gatewayReference === paymentIntentId && tx.status === TRANSACTION_STATUS.SUCCESS)
    : null;

  logger.info("Refund approval started", { requestId, orderId: order.id, paymentIntentId: paymentIntentId || null, remaining });

  await orderService.removeZoomForAllOrderRegistrations(order.id);

  // No PaymentIntent — free / local refund only (same pattern as cancel & refund order).
  if (!paymentIntentId) {
    await sequelize.transaction(async (t) => {
      const refundTx = await refundTransactionRepo.create(
        {
          orderId: order.id,
          refundRequestId: request.id,
          paymentTransactionId: successTx ? successTx.id : null,
          paymentIntentId: null,
          amount: remaining,
          currency: order.currency,
          status: REFUND_TRANSACTION_STATUS.SUCCEEDED,
          scopeType: REFUND_TRANSACTION_SCOPE.FULL_ORDER,
          reason: request.reason || null,
          metadata: JSON.stringify({ source: "refund_request", noPaymentIntent: true }),
          stripeRefundId: null,
          createdByUserId: processedByUserId || null,
        },
        { transaction: t },
      );
      await orderService.applyRefundTransactionEffects(refundTx.id, { transaction: t });
      await orderService.markRefundRequestApprovedIfPendingAfterEffects(refundTx.id, { transaction: t });
    });
    logger.info("approveRefundRequest: completed without Stripe PI", { requestId, orderId: order.id });
    orderHistoryService.record(order.id, ORDER_HISTORY_EVENT.REFUND_REQUEST_APPROVED, { success: true, meta: { requestId, stripe: false }, actorId: processedByUserId });
    orderHistoryService.record(order.id, ORDER_HISTORY_EVENT.PAYMENT_REFUNDED, { success: true, meta: { amount: remaining, currency: order.currency, requestId, stripe: false }, actorId: processedByUserId });
    return await refundRequestRepo.findById(requestId);
  }

  if (!stripeGateway.isConfigured()) {
    const err = new Error("Stripe is not configured; cannot issue refund.");
    err.status = 500;
    throw err;
  }

  logger.info("Issuing Stripe refund for refund approval", { orderId: order.id, paymentIntentId, remaining });

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
      await orderService.markRefundRequestApprovedIfPendingAfterEffects(refundTx.id, { transaction: t });
    }
  });

  logger.info("Refund approval complete", { requestId, orderId: order.id, refundStatus: refund.status });
  if (refund.status === "succeeded") {
    orderHistoryService.record(order.id, ORDER_HISTORY_EVENT.REFUND_REQUEST_APPROVED, { success: true, meta: { requestId, stripeRefundId: refund.id }, actorId: processedByUserId });
    orderHistoryService.record(order.id, ORDER_HISTORY_EVENT.PAYMENT_REFUNDED, { success: true, meta: { amount: remaining, currency: order.currency, requestId, stripeRefundId: refund.id }, actorId: processedByUserId });
  } else {
    // Stripe refund pending — request stays pending; completion happens via webhook
    orderHistoryService.record(order.id, ORDER_HISTORY_EVENT.REFUND_REQUEST_APPROVED, { success: null, meta: { requestId, stripeRefundId: refund.id, stripeStatus: refund.status }, actorId: processedByUserId });
  }
  return await refundRequestRepo.findById(requestId);
}

/**
 * Reject a refund request.
 */
async function rejectRefundRequest(requestId, processedByUserId, orderId) {
  const request = await refundRequestRepo.findById(requestId);
  if (!request) {
    const err = new Error("Refund request not found.");
    err.status = 404;
    throw err;
  }
  if (orderId && String(request.orderId) !== String(orderId)) {
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
  orderHistoryService.record(request.orderId, ORDER_HISTORY_EVENT.REFUND_REQUEST_REJECTED, { success: true, meta: { requestId }, actorId: processedByUserId });
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
