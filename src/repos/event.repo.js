const { Op } = require("sequelize");
const { Event, EventMeeting, Registration, ProductVariant, Product, ProductType, ProductCategory } = require("../models");
const { EVENT_STATUS } = require("../constants/event");

module.exports = {
  async findById(id, options = {}) {
    return await Event.findByPk(id, options);
  },

  async findByProductId(productId, options = {}) {
    const { where: extraWhere, ...rest } = options;
    return await Event.findAll({
      where: { productId, ...extraWhere },
      order: [
        ["startDate", "ASC"],
        ["startTime", "ASC"],
      ],
      ...rest,
    });
  },

  /**
   * Events with eventStatus = active only (for storefront).
   */
  async findActiveByProductId(productId, options = {}) {
    const { where: extraWhere, ...rest } = options;
    return await Event.findAll({
      where: { productId, eventStatus: EVENT_STATUS.ACTIVE, ...extraWhere },
      order: [
        ["startDate", "ASC"],
        ["startTime", "ASC"],
      ],
      ...rest,
    });
  },

  async findByProductVariantId(productVariantId, options = {}) {
    return await Event.findOne({
      where: { productVariantId },
      ...options,
    });
  },

  /** Variant IDs that are attached to any event row for this product (session / dated offers). */
  async listProductVariantIdsLinkedToProduct(productId, options = {}) {
    const rows = await Event.findAll({
      where: {
        productId,
        productVariantId: { [Op.ne]: null },
      },
      attributes: ["productVariantId"],
      ...options,
    });
    return rows.map((r) => r.productVariantId).filter(Boolean);
  },

  async create(data, options = {}) {
    return await Event.create(data, options);
  },

  async update(id, data, options = {}) {
    const row = await Event.findByPk(id, options);
    if (!row) return null;
    return await row.update(data, options);
  },

  async delete(id, options = {}) {
    const row = await Event.findByPk(id, options);
    if (!row) return false;
    await row.destroy(options);
    return true;
  },

  /**
   * All active online events with their EventMeeting included.
   * Used by syncAllEvents to find events that need a Zoom meeting.
   */
  async findActiveOnlineWithMeetings(options = {}) {
    return await Event.findAll({
      where: { eventStatus: EVENT_STATUS.ACTIVE, isOnline: true },
      include: [{ model: EventMeeting, as: "EventMeeting", required: false }],
      ...options,
    });
  },

  /**
   * Active online events for a single product with their EventMeeting included.
   * Used by syncProductEvents.
   */
  async findActiveOnlineByProductIdWithMeeting(productId, options = {}) {
    return await Event.findAll({
      where: { productId, eventStatus: EVENT_STATUS.ACTIVE, isOnline: true },
      include: [{ model: EventMeeting, as: "EventMeeting", required: false }],
      order: [["startDate", "ASC"], ["startTime", "ASC"]],
      ...options,
    });
  },

  /**
   * Single event with EventMeeting and Registrations included.
   * Used by cancelEvent, processEventRefundsAndCleanup, and resyncOrphanedEvent.
   */
  async findByIdWithRegistrationsAndMeeting(eventId, options = {}) {
    return await Event.findByPk(eventId, {
      include: [
        { model: EventMeeting, as: "EventMeeting", required: false },
        { model: Registration, as: "Registrations", required: false },
      ],
      ...options,
    });
  },

  /**
   * Single event with its ProductVariant included.
   * Used by registerForm (seat + price check).
   */
  async findByIdWithVariant(eventId, options = {}) {
    return await Event.findByPk(eventId, {
      include: [{ model: ProductVariant, as: "ProductVariant" }],
      ...options,
    });
  },

  /**
   * All events for a product with ProductVariant, EventMeeting, and Registration count included.
   * Used by the admin events page.
   */
  async findByProductIdWithDetails(productId, options = {}) {
    return await Event.findAll({
      where: { productId },
      include: [
        { model: ProductVariant, as: "ProductVariant" },
        { model: EventMeeting, as: "EventMeeting", required: false },
        { model: Registration, as: "Registrations", required: false, attributes: ["id"] },
      ],
      order: [["startDate", "ASC"], ["startTime", "ASC"]],
      ...options,
    });
  },

  /**
   * Single event with ProductVariant, EventMeeting, and Registration count included.
   * Used by the admin edit event form.
   */
  async findByIdWithDetails(eventId, options = {}) {
    return await Event.findByPk(eventId, {
      include: [
        { model: ProductVariant, as: "ProductVariant" },
        { model: EventMeeting, as: "EventMeeting", required: false },
        { model: Registration, as: "Registrations", required: false, attributes: ["id"] },
        {
          model: Product,
          as: "Product",
          attributes: ["id", "title", "slug"],
          include: [{ model: ProductType, as: "ProductType", attributes: ["id", "name", "slug"], required: false }],
        },
      ],
      ...options,
    });
  },

  /**
   * All events with startDate >= today across all products.
   * Includes Product (with ProductType for type label), Registrations (id only for count), EventMeeting.
   * Ordered soonest first.
   */
  async findUpcomingWithDetails(options = {}) {
    const today = new Date().toISOString().substring(0, 10);
    return await Event.findAll({
      where: { startDate: { [Op.gte]: today }, eventStatus: { [Op.ne]: EVENT_STATUS.CANCELLED } },
      include: [
        {
          model: Product,
          as: "Product",
          attributes: ["id", "title", "slug"],
          include: [
            { model: ProductType, as: "ProductType", attributes: ["id", "name", "slug"], required: false },
            { model: ProductCategory, as: "ProductCategory", attributes: ["id", "slug"], required: false },
          ],
        },
        { model: EventMeeting, as: "EventMeeting", required: false, attributes: ["id", "zoomMeetingId"] },
        { model: Registration, as: "Registrations", required: false, attributes: ["id"] },
      ],
      order: [["startDate", "ASC"], ["startTime", "ASC"]],
      ...options,
    });
  },

  /**
   * All events with startDate < today across all products.
   * Includes same associations as findUpcomingWithDetails.
   * Ordered most recent first.
   */
  async findPastWithDetails(options = {}) {
    const today = new Date().toISOString().substring(0, 10);
    return await Event.findAll({
      where: { startDate: { [Op.lt]: today }, eventStatus: { [Op.ne]: EVENT_STATUS.CANCELLED } },
      include: [
        {
          model: Product,
          as: "Product",
          attributes: ["id", "title", "slug"],
          include: [
            { model: ProductType, as: "ProductType", attributes: ["id", "name", "slug"], required: false },
            { model: ProductCategory, as: "ProductCategory", attributes: ["id", "slug"], required: false },
          ],
        },
        { model: EventMeeting, as: "EventMeeting", required: false, attributes: ["id", "zoomMeetingId"] },
        { model: Registration, as: "Registrations", required: false, attributes: ["id"] },
      ],
      order: [["startDate", "DESC"], ["startTime", "DESC"]],
      ...options,
    });
  },

  /**
   * Active events for a product with ProductVariant included.
   * Used by the public show page to list sessions with seat counts.
   */
  async findActiveByProductIdWithVariant(productId, options = {}) {
    return await Event.findAll({
      where: { productId, eventStatus: EVENT_STATUS.ACTIVE },
      include: [{ model: ProductVariant, as: "ProductVariant" }],
      order: [["startDate", "ASC"], ["startTime", "ASC"]],
      ...options,
    });
  },
};
