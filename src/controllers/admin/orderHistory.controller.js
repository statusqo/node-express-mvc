"use strict";

const orderHistoryRepo = require("../../repos/orderHistory.repo");
const { ORDER_HISTORY_EVENT_LIST } = require("../../constants/orderHistory");

const PAGE_SIZE = 50;

module.exports = {
  async index(req, res) {
    const orderNumber = (req.query.orderNumber || "").trim() || null;
    const event = (req.query.event || "").trim() || null;
    const dateFrom = (req.query.dateFrom || "").trim() || null;
    const dateTo = (req.query.dateTo || "").trim() || null;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    const filters = {
      ...(orderNumber && { orderNumber }),
      ...(event && ORDER_HISTORY_EVENT_LIST.includes(event) && { event }),
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo }),
    };

    const [entries, total] = await Promise.all([
      orderHistoryRepo.findAll(filters, { limit: PAGE_SIZE, offset }),
      orderHistoryRepo.count(filters),
    ]);

    const entriesPlain = (entries || []).map((e) => (e.get ? e.get({ plain: true }) : e));
    const totalPages = Math.ceil(total / PAGE_SIZE);

    res.render("admin/order-history/index", {
      title: "Order History",
      entries: entriesPlain,
      total,
      page,
      totalPages,
      pageSize: PAGE_SIZE,
      filters: { orderNumber: orderNumber || "", event: event || "", dateFrom: dateFrom || "", dateTo: dateTo || "" },
      validEvents: ORDER_HISTORY_EVENT_LIST,
    });
  },
};
