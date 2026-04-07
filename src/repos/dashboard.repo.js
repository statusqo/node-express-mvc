// src/repos/dashboard.repo.js
// Read-only aggregate queries for the admin dashboard.
// All DB access for dashboard metrics lives here; admin.service.js orchestrates.

const { Op } = require('sequelize');
const {
  Order, User,
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
const REFUND_STATUSES = ['refunded', 'partially_refunded'];

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
   * Net revenue this month = gross revenue − refunded order totals this month.
   * Returns Number
   */
  async getNetRevenueThisMonth() {
    const since = monthStart(new Date());

    const [gross, refunded] = await Promise.all([
      Order.sum('total', {
        where: { paymentStatus: { [Op.in]: PAID_STATUSES }, createdAt: { [Op.gte]: since } },
      }),
      Order.sum('total', {
        where: { paymentStatus: { [Op.in]: REFUND_STATUSES }, createdAt: { [Op.gte]: since } },
      }),
    ]);

    return (parseFloat(gross) || 0) - (parseFloat(refunded) || 0);
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