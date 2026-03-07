const refundRequestRepo = require("../repos/refundRequest.repo");
const orderRepo = require("../repos/order.repo");
const transactionRepo = require("../repos/transaction.repo");
const orderService = require("./order.service");
const stripeGateway = require("../gateways/stripe.gateway");
const { PAYMENT_STATUS } = require("../constants/order");
const { TRANSACTION_STATUS } = require("../constants/transaction");

const PENDING = "pending";
const APPROVED = "approved";
const REJECTED = "rejected";

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
  if (order.paymentStatus === "refunded") {
    const err = new Error("This order has already been refunded.");
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
  if (existingApproved.some((r) => r.status === "approved")) {
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
  const { Order } = require("../models");
  return await refundRequestRepo.findAll(filters, {
    include: [{ model: Order, as: "Order", attributes: ["id", "total", "currency", "email", "paymentStatus"] }],
    ...options,
  });
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
  const RefundRequest = require("../models").RefundRequest;
  const { Op } = require("sequelize");
  const list = await RefundRequest.findAll({
    where: { orderId: { [Op.in]: orderIds } },
    attributes: ["orderId", "status"],
    raw: true,
  });
  const map = {};
  for (const r of list) {
    if (!r.orderId) continue;
    const current = map[r.orderId];
    if (!current || r.status === "pending") map[r.orderId] = r.status;
    else if (current !== "pending" && r.status === "approved") map[r.orderId] = "approved";
    else if (current !== "pending" && current !== "approved" && r.status === "rejected") map[r.orderId] = "rejected";
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

  const refund = await stripeGateway.createRefund(paymentIntentId);
  const now = new Date();

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
  }

  await orderRepo.update(order.id, { paymentStatus: "refunded", fulfillmentStatus: "refunded" });
  await orderService.restoreVariantQuantitiesForOrder(order.id);

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
