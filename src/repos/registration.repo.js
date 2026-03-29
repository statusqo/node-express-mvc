const { Registration } = require("../models");

module.exports = {
  async findAllByEventId(eventId, options = {}) {
    if (!eventId) return [];
    return await Registration.findAll({ where: { eventId }, ...options });
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
