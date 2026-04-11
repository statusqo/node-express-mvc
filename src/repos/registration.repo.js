const { fn, col, Op } = require("sequelize");
const { Registration, Order, User } = require("../models");
const { PAYMENT_STATUS } = require("../constants/order");

const PAID_OR_PARTIALLY_REFUNDED = {
  [Op.in]: [PAYMENT_STATUS.PAID, PAYMENT_STATUS.PARTIALLY_REFUNDED],
};

module.exports = {
  async findById(id, options = {}) {
    if (!id) return null;
    return await Registration.findByPk(id, options);
  },

  async findByIdWithOrder(id, options = {}) {
    if (!id) return null;
    return await Registration.findByPk(id, {
      include: [
        {
          model: Order,
          as: "Order",
          attributes: ["id", "orderNumber", "paymentStatus", "fulfillmentStatus", "total", "currency", "stripePaymentIntentId"],
          required: false,
        },
      ],
      ...options,
    });
  },

  async findAllByEventId(eventId, options = {}) {
    if (!eventId) return [];
    return await Registration.findAll({ where: { eventId }, ...options });
  },

  /**
   * All registrations for an event with Order and User details.
   * Used by the admin registrants page.
   */
  async findAllByEventIdWithDetails(eventId, options = {}) {
    if (!eventId) return [];
    return await Registration.findAll({
      where: { eventId },
      include: [
        {
          model: Order,
          as: "Order",
          attributes: ["id", "orderNumber", "paymentStatus", "total", "currency"],
          required: false,
        },
        {
          model: User,
          as: "User",
          attributes: ["id", "email", "forename", "surname"],
          required: false,
        },
      ],
      order: [["createdAt", "ASC"]],
      ...options,
    });
  },

  /**
   * Count registrations whose orders are still "active" for attendance: paid or partially refunded.
   * Uses an inner join to Order so only those payment statuses are included.
   */
  async countPaidByEventId(eventId, options = {}) {
    if (!eventId) return 0;
    return await Registration.count({
      where: { eventId },
      include: [
        {
          model: Order,
          as: "Order",
          attributes: [],
          required: true,
          where: { paymentStatus: PAID_OR_PARTIALLY_REFUNDED },
        },
      ],
      ...options,
    });
  },

  /**
   * Count such registrations grouped by eventId.
   * Returns a Map<eventId, number>.
   */
  async countPaidByEventIds(eventIds, options = {}) {
    const ids = Array.isArray(eventIds) ? eventIds.filter(Boolean) : [];
    if (!ids.length) return new Map();

    const rows = await Registration.findAll({
      attributes: ["eventId", [fn("COUNT", col("Registration.id")), "paidCount"]],
      where: { eventId: ids },
      include: [
        {
          model: Order,
          as: "Order",
          attributes: [],
          required: true,
          where: { paymentStatus: PAID_OR_PARTIALLY_REFUNDED },
        },
      ],
      group: ["Registration.eventId"],
      raw: true,
      ...options,
    });

    const counts = new Map();
    for (const row of rows || []) {
      counts.set(String(row.eventId), Number(row.paidCount) || 0);
    }
    return counts;
  },

  async findAllByOrderId(orderId, options = {}) {
    if (!orderId) return [];
    return await Registration.findAll({ where: { orderId }, ...options });
  },

  async findByOrderAttendeeId(orderAttendeeId, options = {}) {
    if (!orderAttendeeId) return null;
    return await Registration.findOne({ where: { orderAttendeeId }, ...options });
  },

  /**
   * Sequelize findOrCreate wrapper. Returns [instance, created].
   */
  async findOrCreate(where, defaults, options = {}) {
    return await Registration.findOrCreate({ where, defaults, ...options });
  },

  async findOrCreateByOrderAttendee(orderAttendeeId, defaults, options = {}) {
    if (!orderAttendeeId) return [null, false];
    return await Registration.findOrCreate({
      where: { orderAttendeeId },
      defaults,
      ...options,
    });
  },

  async update(id, data, options = {}) {
    const row = await Registration.findByPk(id, options);
    if (!row) return null;
    return await row.update(data, options);
  },

  /**
   * Paranoid soft-delete of a single registration.
   */
  async destroy(id, options = {}) {
    const row = await Registration.findByPk(id, options);
    if (!row) return false;
    await row.destroy(options);
    return true;
  },

  /**
   * Hard-delete all registrations for an event (used when deleting a cancelled event).
   * force: true bypasses paranoid soft-delete.
   */
  async destroyAllByEventId(eventId, options = {}) {
    if (!eventId) return;
    await Registration.destroy({ where: { eventId }, force: true, ...options });
  },
};
