const orderService = require("../../services/order.service");
const refundRequestService = require("../../services/refundRequest.service");

function getUserIdAndSession(req) {
  const userId = req.user ? req.user.id : null;
  const sessionId = req.session && req.sessionID ? req.sessionID : null;
  return { userId, sessionId };
}

module.exports = {
  async list(req, res) {
    const { userId, sessionId } = getUserIdAndSession(req);
    const orders = await orderService.listOrders(userId, sessionId);
    res.render("web/orders/index", {
      title: "My Orders",
      orders,
    });
  },

  async show(req, res) {
    const { userId, sessionId } = getUserIdAndSession(req);
    const orderId = req.params.id;
    const { order, lines } = await orderService.getOrderWithLines(orderId, userId, sessionId);

    const refundRequests = await refundRequestService.findByOrder(order.id);
    const hasPendingRefundRequest = refundRequests.some((r) => r.status === "pending");
    const hasApprovedRefundRequest = refundRequests.some((r) => r.status === "approved");

    res.render("web/orders/show", {
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
