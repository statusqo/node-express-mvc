// src/controllers/admin/orders.controller.js
const orderService = require("../../services/order.service");
const refundRequestService = require("../../services/refundRequest.service");
const { validateOrderUpdate } = require("../../validators/order.schema");
const { PAYMENT_STATUS_LIST, FULFILLMENT_STATUS_LIST } = require("../../constants/order");

/**
 * Parse and validate query params for order filters.
 * @param {object} query - req.query
 * @returns {{ paymentStatus?: string, fulfillmentStatus?: string, dateFrom?: string, dateTo?: string }}
 */
function parseFilters(query) {
  const filters = {};
  if (query.paymentStatus && typeof query.paymentStatus === "string") {
    const s = query.paymentStatus.trim().toLowerCase();
    if (PAYMENT_STATUS_LIST.includes(s)) {
      filters.paymentStatus = s;
    }
  }
  if (query.fulfillmentStatus && typeof query.fulfillmentStatus === "string") {
    const s = query.fulfillmentStatus.trim().toLowerCase();
    if (FULFILLMENT_STATUS_LIST.includes(s)) {
      filters.fulfillmentStatus = s;
    }
  }
  if (query.dateFrom && typeof query.dateFrom === "string") {
    const d = query.dateFrom.trim();
    if (d) filters.dateFrom = d;
  }
  if (query.dateTo && typeof query.dateTo === "string") {
    const d = query.dateTo.trim();
    if (d) filters.dateTo = d;
  }
  if (query.refundRequest && typeof query.refundRequest === "string") {
    const r = query.refundRequest.trim().toLowerCase();
    if (r === "pending") filters.refundRequest = "pending";
  }
  return filters;
}

module.exports = {
  async index(req, res) {
    const filters = parseFilters(req.query || {});
    const orders = await orderService.listOrdersForAdmin(filters);

    const ordersPlain = (orders || []).map((o) => {
      const plain = o.get ? o.get({ plain: true }) : o;
      return plain;
    });

    res.render("admin/orders/index", {
      title: "Orders",
      orders: ordersPlain,
      filters: {
        paymentStatus: filters.paymentStatus || "",
        fulfillmentStatus: filters.fulfillmentStatus || "",
        dateFrom: filters.dateFrom || "",
        dateTo: filters.dateTo || "",
        refundRequest: filters.refundRequest || "",
      },
      validPaymentStatuses: PAYMENT_STATUS_LIST,
      validFulfillmentStatuses: FULFILLMENT_STATUS_LIST,
    });
  },

  async editForm(req, res) {
    const { id } = req.params;
    const payload = await orderService.getAdminOrderEditPayload(id);
    if (!payload) {
      res.setFlash("error", "Order not found.");
      return res.redirect((req.adminPrefix || "") + "/orders");
    }
    const refundRequests = await refundRequestService.findByOrder(id);
    const refundRequestsPlain = (refundRequests || []).map((r) => (r.get ? r.get({ plain: true }) : r));
    const order = payload.order;
    const txs = payload.transactions || [];
    const pendingTx = txs.find((t) => t.status === "pending");
    const canRetryFinalize =
      order.paymentStatus === "pending" && (pendingTx != null || Number(order.total) === 0);
    const canRetryPostCommit =
      order.paymentStatus === "paid" && order.fulfillmentStatus === "pending";
    res.render("admin/orders/edit", {
      title: "Edit Order",
      order: payload.order,
      orderLines: payload.orderLines,
      attendeesByLine: payload.attendeesByLine || {},
      fullOrderRefunds: payload.fullOrderRefunds || [],
      transactions: payload.transactions,
      refundTransactions: payload.refundTransactions || [],
      orderRefundedTotal: payload.orderRefundedTotal,
      orderRemainingRefundable: payload.orderRemainingRefundable,
      canFullRefund: payload.canFullRefund,
      canCancelAndRefundOrder: payload.canCancelAndRefundOrder,
      hasActiveRegistrations: payload.hasActiveRegistrations,
      activeRegistrationCount: payload.activeRegistrationCount,
      orderHasEventLines: payload.orderHasEventLines,
      orderDiscount: payload.orderDiscount || null,
      refundRequests: refundRequestsPlain,
      validFulfillmentStatuses: FULFILLMENT_STATUS_LIST,
      canRetryFinalize,
      canRetryPostCommit,
    });
  },

  async update(req, res) {
    const { id } = req.params;
    const ordersPath = (req.adminPrefix || "") + "/orders";
    const result = validateOrderUpdate(req.body || {});

    if (!result.ok) {
      const payload = await orderService.getAdminOrderEditPayload(id);
      if (!payload) {
        res.setFlash("error", "Order not found.");
        return res.redirect(ordersPath);
      }
      const refundRequests = await refundRequestService.findByOrder(id);
      const refundRequestsPlain = (refundRequests || []).map((r) => (r.get ? r.get({ plain: true }) : r));
      const order = payload.order;
      const txs = payload.transactions || [];
      const pendingTx = txs.find((t) => t.status === "pending");
      const canRetryFinalize =
        order.paymentStatus === "pending" && (pendingTx != null || Number(order.total) === 0);
      const canRetryPostCommit =
        order.paymentStatus === "paid" && order.fulfillmentStatus === "pending";
      return res.status(400).render("admin/orders/edit", {
        title: "Edit Order",
        order: payload.order,
        orderLines: payload.orderLines,
        attendeesByLine: payload.attendeesByLine || {},
        fullOrderRefunds: payload.fullOrderRefunds || [],
        transactions: payload.transactions,
        refundTransactions: payload.refundTransactions || [],
        orderRefundedTotal: payload.orderRefundedTotal,
        orderRemainingRefundable: payload.orderRemainingRefundable,
        canFullRefund: payload.canFullRefund,
        canCancelAndRefundOrder: payload.canCancelAndRefundOrder,
        hasActiveRegistrations: payload.hasActiveRegistrations,
        activeRegistrationCount: payload.activeRegistrationCount,
        orderHasEventLines: payload.orderHasEventLines,
        orderDiscount: payload.orderDiscount || null,
        refundRequests: refundRequestsPlain,
        validFulfillmentStatuses: FULFILLMENT_STATUS_LIST,
        canRetryFinalize,
        canRetryPostCommit,
        error: result.errors[0].message,
      });
    }

    try {
      await orderService.updateOrderForAdmin(id, result.data);
      res.setFlash("success", "Order updated.");
      return res.redirect(302, ordersPath);
    } catch (err) {
      const status = err.status ?? err.statusCode ?? 400;
      const message = status === 404 ? "Order not found." : err.message || "Could not update order.";
      const payload = await orderService.getAdminOrderEditPayload(id);
      const orderPlain = payload ? payload.order : { id };
      const refundRequests = payload ? await refundRequestService.findByOrder(id) : [];
      const refundRequestsPlain = (refundRequests || []).map((r) => (r.get ? r.get({ plain: true }) : r));
      const canRetryFinalize = payload
        ? payload.order.paymentStatus === "pending" &&
          ((payload.transactions || []).some((t) => t.status === "pending") || Number(payload.order.total) === 0)
        : false;
      const canRetryPostCommit = payload
        ? payload.order.paymentStatus === "paid" && payload.order.fulfillmentStatus === "pending"
        : false;
      return res.status(status).render("admin/orders/edit", {
        title: "Edit Order",
        order: orderPlain,
        orderLines: payload ? payload.orderLines : [],
        attendeesByLine: payload ? payload.attendeesByLine || {} : {},
        fullOrderRefunds: payload ? payload.fullOrderRefunds || [] : [],
        transactions: payload ? payload.transactions : [],
        refundTransactions: payload ? payload.refundTransactions || [] : [],
        orderRefundedTotal: payload ? payload.orderRefundedTotal : 0,
        orderRemainingRefundable: payload ? payload.orderRemainingRefundable : 0,
        canFullRefund: payload ? payload.canFullRefund : false,
        canCancelAndRefundOrder: payload ? payload.canCancelAndRefundOrder : false,
        hasActiveRegistrations: payload ? payload.hasActiveRegistrations : false,
        activeRegistrationCount: payload ? payload.activeRegistrationCount : 0,
        orderHasEventLines: payload ? payload.orderHasEventLines : false,
        orderDiscount: payload ? payload.orderDiscount || null : null,
        refundRequests: refundRequestsPlain,
        validFulfillmentStatuses: FULFILLMENT_STATUS_LIST,
        canRetryFinalize,
        canRetryPostCommit,
        error: message,
      });
    }
  },

  async cancelAndRefundOrder(req, res) {
    const { id } = req.params;
    const editUrl = (req.adminPrefix || "") + "/orders/" + id + "/edit";
    const adminUserId = req.user && req.user.id;
    if (!adminUserId) {
      res.setFlash("error", "Not authenticated.");
      return res.redirect((req.adminPrefix || "") + "/orders");
    }
    try {
      const result = await orderService.cancelAndRefundOrderForAdmin(id, { processedByUserId: adminUserId });
      if (result.pending) {
        res.setFlash(
          "success",
          "Refund submitted to Stripe. When it completes, inventory and registrations will update automatically.",
        );
      } else {
        const cur = result.currency || "EUR";
        res.setFlash(
          "success",
          `Cancel and refund completed: ${Number(result.remaining).toFixed(2)} ${cur} refunded.`,
        );
      }
    } catch (err) {
      const msg = err.status === 404 ? "Order not found." : err.message || "Could not cancel and refund order.";
      res.setFlash("error", msg);
    }
    return res.redirect(302, editUrl);
  },

  async retryFinalizePayment(req, res) {
    const { id: orderId } = req.params;
    const prefix = (req.adminPrefix || "") + "/orders/" + orderId + "/edit";
    try {
      const { skipped, message } = await orderService.retryFinalizeStaleOrderForAdmin(orderId);
      res.setFlash("success", skipped ? message || "Order is already paid." : "Payment finalized (inventory, registrations, and order state updated).");
    } catch (err) {
      const msg = err.status === 404 ? "Order not found." : err.message || "Could not finalize payment.";
      res.setFlash("error", msg);
    }
    return res.redirect(302, prefix);
  },

  async retryPostCommitFulfillment(req, res) {
    const { id: orderId } = req.params;
    const prefix = (req.adminPrefix || "") + "/orders/" + orderId + "/edit";
    try {
      await orderService.retryPostCommitFulfillmentForAdmin(orderId);
      res.setFlash("success", "Confirmation email and digital fulfillment were run again. Retry Zoom from the event Registrants page if needed.");
    } catch (err) {
      const msg = err.status === 404 ? "Order not found." : err.message || "Could not run post-payment steps.";
      res.setFlash("error", msg);
    }
    return res.redirect(302, prefix);
  },

  async approveRefundRequest(req, res) {
    const { id: orderId, requestId } = req.params;
    const prefix = (req.adminPrefix || "") + "/orders/" + orderId + "/edit";
    const adminUserId = req.user && req.user.id;
    if (!adminUserId) {
      res.setFlash("error", "Not authenticated.");
      return res.redirect((req.adminPrefix || "") + "/orders");
    }
    try {
      const result = await refundRequestService.approveRefundRequest(requestId, adminUserId);
      const reqStatus = result && (result.get ? result.get("status") : result.status);
      if (reqStatus === "pending") {
        res.setFlash(
          "success",
          "Refund submitted to Stripe. The request completes when Stripe confirms; you can retry Approve or wait for automatic processing.",
        );
      } else {
        res.setFlash("success", "Refund approved.");
      }
    } catch (err) {
      const msg = err.status === 404 ? "Refund request not found." : err.message || "Could not approve refund.";
      res.setFlash("error", msg);
    }
    return res.redirect(302, prefix);
  },

  async rejectRefundRequest(req, res) {
    const { id: orderId, requestId } = req.params;
    const prefix = (req.adminPrefix || "") + "/orders/" + orderId + "/edit";
    const adminUserId = req.user && req.user.id;
    if (!adminUserId) {
      res.setFlash("error", "Not authenticated.");
      return res.redirect((req.adminPrefix || "") + "/orders");
    }
    try {
      await refundRequestService.rejectRefundRequest(requestId, adminUserId);
      res.setFlash("success", "Refund request rejected.");
    } catch (err) {
      const msg = err.status === 404 ? "Refund request not found." : err.message || "Could not reject.";
      res.setFlash("error", msg);
    }
    return res.redirect(302, prefix);
  },
};
