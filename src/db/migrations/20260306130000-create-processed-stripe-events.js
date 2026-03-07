"use strict";

/**
 * Create processed_stripe_events table.
 * Stores every Stripe event.id that has been successfully processed.
 * Used to provide true idempotency against duplicate webhook deliveries —
 * an event that was already processed is skipped on re-delivery.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("processed_stripe_events", {
      eventId: {
        type: Sequelize.STRING,
        primaryKey: true,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("processed_stripe_events");
  },
};
