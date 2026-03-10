// src/controllers/admin/orders.controller.js
const orderService = require("../../services/order.service");
const refundRequestService = require("../../services/refundRequest.service");
const invoiceService = require("../../services/invoice.service");
const { validateOrderUpdate } = require("../../validators/order.schema");
const { PAYMENT_STATUSES, FULFILLMENT_STATUSES } = require("../../constants/order");

/**
 * Parse and validate query params for order filters.
 * @param {object} query - req.query
 * @returns {{ paymentStatus?: string, fulfillmentStatus?: string, dateFrom?: string, dateTo?: string }}
 */
function parseFilters(query) {
  const filters = {};
  if (query.paymentStatus && typeof query.paymentStatus === "string") {
    const s = query.paymentStatus.trim().toLowerCase();
    if (PAYMENT_STATUSES.includes(s)) {
      filters.paymentStatus = s;
    }
  }
  if (query.fulfillmentStatus && typeof query.fulfillmentStatus === "string") {
    const s = query.fulfillmentStatus.trim().toLowerCase();
    if (FULFILLMENT_STATUSES.includes(s)) {
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
      validPaymentStatuses: PAYMENT_STATUSES,
      validFulfillmentStatuses: FULFILLMENT_STATUSES,
    });
  },

  async editForm(req, res) {
    const { id } = req.params;
    const order = await orderService.getOrderByIdForAdmin(id);
    if (!order) {
      res.setFlash("error", "Order not found.");
      return res.redirect((req.adminPrefix || "") + "/orders");
    }
    const orderPlain = order.get ? order.get({ plain: true }) : order;
    const [refundRequests, invoice] = await Promise.all([
      refundRequestService.findByOrder(order.id),
      invoiceService.getInvoiceForOrder(order.id),
    ]);
    const refundRequestsPlain = (refundRequests || []).map((r) => (r.get ? r.get({ plain: true }) : r));
    res.render("admin/orders/edit", {
      title: "Edit Order",
      order: orderPlain,
      refundRequests: refundRequestsPlain,
      invoice: invoice || null,
      validFulfillmentStatuses: FULFILLMENT_STATUSES,
    });
  },

  async update(req, res) {
    const { id } = req.params;
    const ordersPath = (req.adminPrefix || "") + "/orders";
    const result = validateOrderUpdate(req.body || {});

    if (!result.ok) {
      const order = await orderService.getOrderByIdForAdmin(id);
      if (!order) {
        res.setFlash("error", "Order not found.");
        return res.redirect(ordersPath);
      }
      const orderPlain = order.get ? order.get({ plain: true }) : order;
      const [refundRequests, invoice] = await Promise.all([
        refundRequestService.findByOrder(order.id),
        invoiceService.getInvoiceForOrder(order.id),
      ]);
      const refundRequestsPlain = (refundRequests || []).map((r) => (r.get ? r.get({ plain: true }) : r));
      return res.status(400).render("admin/orders/edit", {
        title: "Edit Order",
        order: orderPlain,
        refundRequests: refundRequestsPlain,
        invoice: invoice || null,
        validFulfillmentStatuses: FULFILLMENT_STATUSES,
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
      const order = await orderService.getOrderByIdForAdmin(id);
      const orderPlain = order ? (order.get ? order.get({ plain: true }) : order) : { id };
      const [refundRequests, invoice] = order
        ? await Promise.all([
            refundRequestService.findByOrder(order.id),
            invoiceService.getInvoiceForOrder(order.id),
          ])
        : [[], null];
      const refundRequestsPlain = (refundRequests || []).map((r) => (r.get ? r.get({ plain: true }) : r));
      return res.status(status).render("admin/orders/edit", {
        title: "Edit Order",
        order: orderPlain,
        refundRequests: refundRequestsPlain,
        invoice: invoice || null,
        validFulfillmentStatuses: FULFILLMENT_STATUSES,
        error: message,
      });
    }
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
      await refundRequestService.approveRefundRequest(requestId, adminUserId);
      res.setFlash("success", "Refund approved.");
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
