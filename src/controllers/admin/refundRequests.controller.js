const refundRequestService = require("../../services/refundRequest.service");

module.exports = {
  async index(req, res) {
    const statusFilter = (req.query.status || "").trim().toLowerCase();
    const filters = statusFilter && ["pending", "approved", "rejected"].includes(statusFilter)
      ? { status: statusFilter }
      : {};
    const list = await refundRequestService.findRefundRequestsForAdmin(filters);
    const listPlain = (list || []).map((r) => (r.get ? r.get({ plain: true }) : r));
    res.render("admin/refund-requests/index", {
      title: "Refund Requests",
      refundRequests: listPlain,
      filters: { status: statusFilter || "" },
    });
  },
};
