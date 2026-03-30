const { Registration, Order, User } = require("../models");

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
          attributes: ["id", "paymentStatus", "fulfillmentStatus", "total", "currency", "stripePaymentIntentId"],
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
          attributes: ["id", "paymentStatus", "total", "currency"],
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

  async findAllByOrderId(orderId, options = {}) {
    if (!orderId) return [];
    return await Registration.findAll({ where: { orderId }, ...options });
  },

  /**
   * Sequelize findOrCreate wrapper. Returns [instance, created].
   */
  async findOrCreate(where, defaults, options = {}) {
    return await Registration.findOrCreate({ where, defaults, ...options });
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
