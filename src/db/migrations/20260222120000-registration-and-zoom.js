"use strict";

/**
 * Adds: Event.isOnline, OrderLine.eventId, registrations, admin_zoom_accounts, event_meetings.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const ts = {
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    };
    const uuid = { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true };

    await queryInterface.addColumn("events", "isOnline", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.addColumn("order_lines", "eventId", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "events", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
    await queryInterface.addIndex("order_lines", ["eventId"]);

    await queryInterface.createTable("registrations", {
      id: uuid,
      eventId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "events", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      orderId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "orders", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      orderLineId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "order_lines", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      email: { type: Sequelize.STRING, allowNull: false },
      forename: { type: Sequelize.STRING, allowNull: true },
      surname: { type: Sequelize.STRING, allowNull: true },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "registered",
      },
      zoomRegistrantId: { type: Sequelize.STRING, allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex("registrations", ["eventId"]);
    await queryInterface.addIndex("registrations", ["orderId"]);
    await queryInterface.addIndex("registrations", ["orderLineId"]);
    await queryInterface.addIndex("registrations", ["eventId", "orderLineId"], { unique: true });

    await queryInterface.createTable("admin_zoom_accounts", {
      id: uuid,
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      zoomUserId: { type: Sequelize.STRING, allowNull: false },
      accessToken: { type: Sequelize.TEXT, allowNull: false },
      refreshToken: { type: Sequelize.TEXT, allowNull: true },
      tokenExpiresAt: { type: Sequelize.DATE, allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex("admin_zoom_accounts", ["userId"], { unique: true });
    await queryInterface.addIndex("admin_zoom_accounts", ["zoomUserId"]);

    await queryInterface.createTable("event_meetings", {
      id: uuid,
      eventId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "events", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      provider: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "zoom",
      },
      providerMeetingId: { type: Sequelize.STRING, allowNull: false },
      joinUrl: { type: Sequelize.STRING, allowNull: false },
      startUrl: { type: Sequelize.STRING, allowNull: true },
      hostZoomAccountId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "admin_zoom_accounts", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      ...ts,
    });
    await queryInterface.addIndex("event_meetings", ["eventId"], { unique: true });
    await queryInterface.addIndex("event_meetings", ["providerMeetingId"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("event_meetings");
    await queryInterface.dropTable("admin_zoom_accounts");
    await queryInterface.dropTable("registrations");
    await queryInterface.removeColumn("order_lines", "eventId");
    await queryInterface.removeColumn("events", "isOnline");
  },
};
