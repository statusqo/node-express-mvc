// src/repos/dashboard.repo.js
// Read-only aggregate queries for the admin dashboard.
// All DB access for dashboard metrics lives here; admin.service.js orchestrates.

const { Op } = require('sequelize');
const {
  Order, User, RefundTransaction,
} = require('../models');

function monthStart(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function prevMonthRange(now) {
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end   = new Date(monthStart(now).getTime() - 1);
  return { start, end };
}

const PAID_STATUSES = ['paid', 'partially_refunded', 'refunded'];

module.exports = {

  // ── Revenue ────────────────────────────────────────────────────────

  /**
   * Gross revenue for this month and the previous month (for delta KPI).
   * Returns { thisMonth: Number, prevMonth: Number }
   */
  async getMonthlyRevenue() {
    const now      = new Date();
    const thisStart = monthStart(now);
    const { start: prevStart, end: prevEnd } = prevMonthRange(now);

    const [thisMonth, prevMonth] = await Promise.all([
      Order.sum('total', {
        where: { paymentStatus: { [Op.in]: PAID_STATUSES }, createdAt: { [Op.gte]: thisStart } },
      }),
      Order.sum('total', {
        where: { paymentStatus: { [Op.in]: PAID_STATUSES }, createdAt: { [Op.between]: [prevStart, prevEnd] } },
      }),
    ]);

    return { thisMonth: parseFloat(thisMonth) || 0, prevMonth: parseFloat(prevMonth) || 0 };
  },

  /**
   * Net revenue this month = sum of paid order totals − sum of succeeded refund
   * transaction amounts for those orders.
   *
   * Uses RefundTransaction.amount (the actual refunded value) rather than
   * Order.total so partial refunds are correctly accounted for:
   *   - paid order, no refund  → counts in full
   *   - partially refunded     → counts minus the refunded portion only
   *   - fully refunded         → counts as zero
   *
   * Returns Number
   */
  async getNetRevenueThisMonth() {
    const since = monthStart(new Date());

    // Fetch all paid-status orders this month with their totals and IDs in one query.
    const paidOrders = await Order.findAll({
      where: {
        paymentStatus: { [Op.in]: PAID_STATUSES },
        createdAt: { [Op.gte]: since },
      },
      attributes: ['id', 'total'],
      raw: true,
    });

    if (!paidOrders.length) return 0;

    const gross = paidOrders.reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0);
    const orderIds = paidOrders.map((o) => o.id);

    // Sum only succeeded refund transactions — pending/failed refunds don't reduce revenue yet.
    const refunded = await RefundTransaction.sum('amount', {
      where: {
        orderId: { [Op.in]: orderIds },
        status: 'succeeded',
      },
    });

    return Math.max(0, gross - (parseFloat(refunded) || 0));
  },

  // ── Orders ─────────────────────────────────────────────────────────

  /**
   * Order counts for this month and previous month.
   * Returns { thisMonth: Number, prevMonth: Number }
   */
  async getMonthlyOrders() {
    const now      = new Date();
    const thisStart = monthStart(now);
    const { start: prevStart, end: prevEnd } = prevMonthRange(now);

    const [thisMonth, prevMonth] = await Promise.all([
      Order.count({ where: { createdAt: { [Op.gte]: thisStart } } }),
      Order.count({ where: { createdAt: { [Op.between]: [prevStart, prevEnd] } } }),
    ]);

    return { thisMonth, prevMonth };
  },

  /**
   * Orders requiring action: pending / processing / refund_requested, oldest first.
   * Returns Order[] (raw)
   */
  async getActionableOrders(limit = 8) {
    return Order.findAll({
      where: {
        fulfillmentStatus: { [Op.in]: ['pending', 'processing', 'refund_requested'] },
      },
      order: [['createdAt', 'ASC']],
      limit,
      raw: true,
    });
  },

  // ── Users ──────────────────────────────────────────────────────────

  /**
   * New user counts for this month and previous month.
   * Returns { thisMonth: Number, prevMonth: Number }
   */
  async getMonthlyUsers() {
    const now      = new Date();
    const thisStart = monthStart(now);
    const { start: prevStart, end: prevEnd } = prevMonthRange(now);

    const [thisMonth, prevMonth] = await Promise.all([
      User.count({ where: { createdAt: { [Op.gte]: thisStart } } }),
      User.count({ where: { createdAt: { [Op.between]: [prevStart, prevEnd] } } }),
    ]);

    return { thisMonth, prevMonth };
  },

};