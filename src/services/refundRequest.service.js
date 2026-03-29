const refundRequestRepo = require("../repos/refundRequest.repo");
const orderRepo = require("../repos/order.repo");
const transactionRepo = require("../repos/transaction.repo");
const orderService = require("./order.service");
const stripeGateway = require("../gateways/stripe.gateway");
const logger = require("../config/logger");
const registrationRepo = require("../repos/registration.repo");
const eventMeetingRepo = require("../repos/eventMeeting.repo");
const { PAYMENT_STATUS } = require("../constants/order");
const { TRANSACTION_STATUS } = require("../constants/transaction");
const { REFUND_REQUEST_STATUS } = require("../constants/refundRequest");
const { getMeetingProvider } = require("../gateways/meeting.interface");

const PENDING = REFUND_REQUEST_STATUS.PENDING;
const APPROVED = REFUND_REQUEST_STATUS.APPROVED;
const REJECTED = REFUND_REQUEST_STATUS.REJECTED;

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
  if (order.paymentStatus !== PAYMENT_STATUS.PAID) {
    const err = new Error("Only paid orders can request a refund.");
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
  const existingApproved = await refundRequestRepo.findByOrder(orderId);
  if (existingApproved.some((r) => r.status === APPROVED)) {
    const err = new Error("This order has already received a refund (full or partial).");
    err.status = 400;
    throw err;
  }

  const request = await refundRequestRepo.create({
    orderId,
    status: PENDING,
    reason: reason && String(reason).trim() ? String(reason).trim() : null,
    requestedByUserId: requestedByUserId || null,
  });
  await orderRepo.update(orderId, { fulfillmentStatus: "refund_requested" });
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
  if (order.paymentStatus !== PAYMENT_STATUS.PAID) {
    const err = new Error("Order is not paid; cannot refund.");
    err.status = 400;
    throw err;
  }

  const paymentIntentId = order.stripePaymentIntentId;
  if (!paymentIntentId) {
    const err = new Error("Order has no payment intent; cannot refund.");
    err.status = 400;
    throw err;
  }

  logger.info("Refund approval started", { requestId, orderId: order.id, paymentIntentId });

  // Step 1: Remove registrants from Zoom before charging Stripe.
  // Non-404 errors abort the entire approval — customer must not be refunded while still having Zoom access.
  // 404 is swallowed (registrant already gone — desired state, safe to proceed).
  const registrations = await registrationRepo.findAllByOrderId(order.id);
  logger.info("Registrations found for refund approval", { orderId: order.id, count: registrations.length });

  for (const reg of registrations) {
    if (!reg.zoomRegistrantId) {
      logger.info("Registration has no Zoom registrant — skipping Zoom removal", { registrationId: reg.id });
      continue;
    }
    const meeting = await eventMeetingRepo.findByEventId(reg.eventId);
    if (!meeting) {
      logger.info("No EventMeeting found for registration — skipping Zoom removal", { registrationId: reg.id, eventId: reg.eventId });
      continue;
    }
    const provider = getMeetingProvider();
    if (!provider) {
      logger.info("No meeting provider configured — skipping Zoom removal", { registrationId: reg.id });
      continue;
    }
    try {
      await provider.removeRegistrant(meeting, reg.zoomRegistrantId);
      logger.info("Zoom registrant removed for refund approval", { orderId: order.id, registrantId: reg.zoomRegistrantId });
    } catch (e) {
      if (e.status === 404) {
        // Already removed — idempotent, safe to continue
        logger.info("Zoom registrant already removed (404) for refund approval", { orderId: order.id, registrantId: reg.zoomRegistrantId });
      } else {
        logger.warn("Zoom remove registrant failed during refund approval — aborting", { err: e.message, orderId: order.id, registrantId: reg.zoomRegistrantId });
        throw new Error(`Zoom error: ${e.message}. Refund has not been issued — please retry.`);
      }
    }
  }

  // Step 2: Issue Stripe refund. Throws on failure — Zoom removal already done but idempotent on retry (404).
  logger.info("Issuing Stripe refund for refund approval", { orderId: order.id, paymentIntentId });
  const refund = await stripeGateway.createRefund(paymentIntentId);
  logger.info("Stripe refund issued", { orderId: order.id, refundId: refund.id, status: refund.status });
  const now = new Date();

  // Step 3: Commit all DB updates.
  await refundRequestRepo.update(requestId, {
    status: APPROVED,
    processedAt: now,
    processedByUserId,
    stripeRefundId: refund.id,
  });

  const transactions = await transactionRepo.findByOrder(order.id);
  const successTransaction = transactions.find(
    (t) => t.gatewayReference === paymentIntentId && t.status === TRANSACTION_STATUS.SUCCESS
  );
  if (successTransaction) {
    await transactionRepo.update(successTransaction.id, { status: TRANSACTION_STATUS.REFUNDED });
    logger.info("Transaction marked refunded", { transactionId: successTransaction.id });
  }

  await orderRepo.update(order.id, { paymentStatus: "refunded", fulfillmentStatus: "refunded" });
  await orderService.restoreVariantQuantitiesForOrder(order.id);
  logger.info("Order marked refunded, variant quantities restored", { orderId: order.id });

  // Step 4: Soft-delete registrations.
  for (const reg of registrations) {
    await registrationRepo.destroy(reg.id);
    logger.info("Registration soft-deleted", { registrationId: reg.id, orderId: order.id });
  }

  logger.info("Refund approval complete", { requestId, orderId: order.id });
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

  await refundRequestRepo.update(requestId, {
    status: REJECTED,
    processedAt: new Date(),
    processedByUserId,
  });
  await orderRepo.update(request.orderId, { fulfillmentStatus: "delivered" });
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
