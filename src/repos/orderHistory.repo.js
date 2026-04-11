"use strict";

const { Op } = require("sequelize");
const { OrderHistory, User, Order } = require("../models");

const defaultInclude = [
  { model: Order, as: "Order", attributes: ["id", "orderNumber"], required: false },
  { model: User, as: "Actor", attributes: ["id", "email", "forename", "surname"], required: false },
];

function buildWhere(filters = {}) {
  const where = {};

  if (filters.orderId) where.orderId = filters.orderId;
  if (filters.event) where.event = filters.event;

  if (filters.dateFrom || filters.dateTo) {
    const fromStr = filters.dateFrom && String(filters.dateFrom).trim();
    const toStr = filters.dateTo && String(filters.dateTo).trim();
    if (fromStr && toStr) {
      where.createdAt = { [Op.between]: [new Date(fromStr + "T00:00:00.000Z"), new Date(toStr + "T23:59:59.999Z")] };
    } else if (fromStr) {
      where.createdAt = { [Op.gte]: new Date(fromStr + "T00:00:00.000Z") };
    } else if (toStr) {
      where.createdAt = { [Op.lte]: new Date(toStr + "T23:59:59.999Z") };
    }
  }

  return where;
}

module.exports = {
  /**
   * Record a single order history event.
   * @param {Object} data - { orderId, event, success?, meta?, actorId? }
   */
  async record(data) {
    return await OrderHistory.create({
      orderId: data.orderId,
      event: data.event,
      success: data.success != null ? data.success : null,
      meta: data.meta || null,
      actorId: data.actorId || null,
    });
  },

  /**
   * Find all history entries for a specific order, newest first.
   */
  async findByOrder(orderId) {
    if (!orderId) return [];
    return await OrderHistory.findAll({
      where: { orderId },
      include: defaultInclude,
      order: [["createdAt", "DESC"]],
    });
  },

  /**
   * Find all history entries across all orders with optional filters.
   * Supports filtering by orderNumber (resolved to orderId via subquery on Order).
   * @param {Object} filters - { orderId?, orderNumber?, event?, dateFrom?, dateTo? }
   * @param {Object} options - Sequelize options (limit, offset, etc.)
   */
  async findAll(filters = {}, options = {}) {
    // Resolve orderNumber → orderId if provided
    if (filters.orderNumber) {
      const num = parseInt(filters.orderNumber, 10);
      if (!isNaN(num)) {
        const order = await Order.findOne({ where: { orderNumber: num }, attributes: ["id"] });
        filters = { ...filters, orderId: order ? order.id : "__no_match__" };
      }
    }

    const where = buildWhere(filters);

    return await OrderHistory.findAll({
      where: Object.keys(where).length ? where : undefined,
      include: defaultInclude,
      order: [["createdAt", "DESC"]],
      ...options,
    });
  },

  async count(filters = {}) {
    // Resolve orderNumber → orderId if provided
    if (filters.orderNumber) {
      const num = parseInt(filters.orderNumber, 10);
      if (!isNaN(num)) {
        const order = await Order.findOne({ where: { orderNumber: num }, attributes: ["id"] });
        filters = { ...filters, orderId: order ? order.id : "__no_match__" };
      }
    }

    const where = buildWhere(filters);
    return await OrderHistory.count({ where: Object.keys(where).length ? where : undefined });
  },

  /**
   * Returns true if at least one successful (success = true) event of the given type
   * exists for the given order.
   */
  async hasSuccessfulEvent(orderId, eventType) {
    if (!orderId || !eventType) return false;
    const count = await OrderHistory.count({ where: { orderId, event: eventType, success: true } });
    return count > 0;
  },
};
