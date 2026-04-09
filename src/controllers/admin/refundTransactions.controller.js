const refundTransactionRepo = require("../../repos/refundTransaction.repo");
const { REFUND_TRANSACTION_STATUS_LIST } = require("../../constants/refundTransaction");

module.exports = {
  async index(req, res) {
    const statusFilter = (req.query.status || "").trim().toLowerCase();
    const filters = statusFilter && REFUND_TRANSACTION_STATUS_LIST.includes(statusFilter)
      ? { status: statusFilter }
      : {};
    const list = await refundTransactionRepo.findAll(filters);
    const listPlain = (list || []).map((r) => (r.get ? r.get({ plain: true }) : r));
    res.render("admin/refund-transactions/index", {
      title: "Refund Transactions",
      refundTransactions: listPlain,
      filters: { status: statusFilter || "" },
      validStatuses: REFUND_TRANSACTION_STATUS_LIST,
    });
  },
};
