const orderService = require("../../services/order.service");
const refundRequestService = require("../../services/refundRequest.service");
const { getDefaultGateway } = require("../../gateways");
const logger = require("../../config/logger");

function getUserIdAndSession(req) {
  const userId = req.user ? req.user.id : null;
  const sessionId = req.session && req.sessionID ? req.sessionID : null;
  return { userId, sessionId };
}

module.exports = {
  async list(req, res) {
    const { userId, sessionId } = getUserIdAndSession(req);
    const orders = await orderService.listOrders(userId, sessionId);
    res.render("web/orders", {
      title: "My Orders",
      orders,
    });
  },

  async show(req, res) {
    const { userId, sessionId } = getUserIdAndSession(req);
    const orderId = req.params.id;
    const { order, lines } = await orderService.getOrderWithLines(orderId, userId, sessionId);

    // After checkout, user lands here with ?pay=1. Redirect to Stripe Checkout (standard HTTP 302 on GET).
    // If Stripe is unavailable, render order page with flash; user can use "Pay with Stripe" button.
    const shouldRedirectToStripe = req.query.pay === "1" && (order.paymentStatus === "pending" || order.paymentStatus === "failed");
    if (shouldRedirectToStripe) {
      try {
        const gateway = getDefaultGateway();
        if (gateway) {
          const result = await gateway.createCheckoutSession(order.id, userId, sessionId);
          if (result && result.success && result.url) {
            return res.redirect(302, result.url);
          }
        }
      } catch (stripeErr) {
        logger.error("Orders show: Stripe checkout session failed", stripeErr);
        res.locals.flash = {
          type: "error",
          message: "Payment could not be started. Please try the button below.",
        };
      }
    }

    // Returning from Stripe with session_id: show processing message
    const stripeSessionId = req.query.session_id;
    if (stripeSessionId && order.paymentStatus === "pending") {
      res.locals.flash = {
        type: "info",
        message: "Payment is being processed. Your order will be updated shortly.",
      };
    }

    const refundRequests = await refundRequestService.findByOrder(order.id);
    const hasPendingRefundRequest = refundRequests.some((r) => r.status === "pending");
    const hasApprovedRefundRequest = refundRequests.some((r) => r.status === "approved");

    res.render("web/order", {
      title: "Order",
      order,
      lines,
      refundRequests,
      hasPendingRefundRequest,
      hasApprovedRefundRequest,
      stripePublishableKey: require("../../config").stripe?.publishableKey || "",
    });
  },

  async refundRequest(req, res) {
    const { userId, sessionId } = getUserIdAndSession(req);
    const orderId = req.params.id;
    const { order } = await orderService.getOrderWithLines(orderId, userId, sessionId);
    const reason = req.body.reason && String(req.body.reason).trim() ? String(req.body.reason).trim() : null;
    await refundRequestService.createRefundRequest(order.id, userId || null, reason);
    res.setFlash("success", "Your refund request has been submitted. We will review it shortly.");
    return res.redirect("/orders/" + order.id);
  },
};
