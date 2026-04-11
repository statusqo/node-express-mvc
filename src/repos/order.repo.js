const { Op } = require("sequelize");
const { sequelize } = require("../db/client");
const { Order, OrderLine, ProductVariant, Product, ProductPrice, RefundRequest } = require("../models");
const { PAYMENT_STATUS_LIST, FULFILLMENT_STATUS_LIST } = require("../constants/order");

const defaultLineInclude = [
  {
    model: ProductVariant,
    as: "ProductVariant",
    attributes: ["id", "title", "productId", "isDefault"],
    required: false,
    include: [
      { model: Product, as: "Product", attributes: ["id", "title", "slug", "isPhysical"] },
      { model: ProductPrice, as: "ProductPrices", where: { isDefault: true }, required: false, limit: 1, attributes: ["amount", "currency"] },
    ],
  },
];

module.exports = {
  async findById(id, options = {}) {
    if (!id) return null;
    return await Order.findByPk(id, options);
  },

  async findByUser(userId, options = {}) {
    if (!userId) return [];
    return await Order.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
      ...options,
    });
  },

  async findBySessionId(sessionId, options = {}) {
    if (!sessionId) return [];
    return await Order.findAll({
      where: { sessionId },
      order: [["createdAt", "DESC"]],
      ...options,
    });
  },

  /**
   * Find all orders for a user: by userId, or by email if userId is null (guest orders).
   * Used by admin to show full order history for a user.
   */
  async findByUserOrEmail(userId, email, options = {}) {
    if (!userId && !email) return [];
    const conditions = [];
    if (userId) {
      conditions.push({ userId });
    }
    if (email && typeof email === "string") {
      const normalized = email.trim().toLowerCase();
      if (normalized) {
        conditions.push({
          userId: null,
          [Op.and]: [
            sequelize.where(
              sequelize.fn("LOWER", sequelize.col("email")),
              Op.eq,
              normalized
            ),
          ],
        });
      }
    }
    if (conditions.length === 0) return [];
    const where = conditions.length === 1 ? conditions[0] : { [Op.or]: conditions };
    return await Order.findAll({
      where,
      order: [["createdAt", "DESC"]],
      ...options,
    });
  },

  async findAll(options = {}) {
    return await Order.findAll(options);
  },

  async count(options = {}) {
    return await Order.count(options);
  },

  /**
   * Find all orders with optional filters for admin.
   * @param {Object} filters - { paymentStatus?, fulfillmentStatus?, dateFrom?, dateTo?, refundRequest?: 'pending' }
   * @param {Object} options - Sequelize options
   * @returns {Promise<Order[]>}
   */
  async findAllWithFilters(filters = {}, options = {}) {
    const where = {};

    if (filters.paymentStatus && PAYMENT_STATUS_LIST.includes(filters.paymentStatus)) {
      where.paymentStatus = filters.paymentStatus;
    }
    if (filters.fulfillmentStatus && FULFILLMENT_STATUS_LIST.includes(filters.fulfillmentStatus)) {
      where.fulfillmentStatus = filters.fulfillmentStatus;
    }

    if (filters.dateFrom || filters.dateTo) {
      const fromStr = filters.dateFrom && String(filters.dateFrom).trim();
      const toStr = filters.dateTo && String(filters.dateTo).trim();
      if (fromStr && toStr) {
        const startDate = new Date(fromStr + "T00:00:00.000Z");
        const endDate = new Date(toStr + "T23:59:59.999Z");
        if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
          where.createdAt = { [Op.between]: [startDate, endDate] };
        }
      } else if (fromStr) {
        const startDate = new Date(fromStr + "T00:00:00.000Z");
        if (!isNaN(startDate.getTime())) {
          where.createdAt = { [Op.gte]: startDate };
        }
      } else if (toStr) {
        const endDate = new Date(toStr + "T23:59:59.999Z");
        if (!isNaN(endDate.getTime())) {
          where.createdAt = { [Op.lte]: endDate };
        }
      }
    }

    const hasConditions = Object.keys(where).length > 0;
    const include = [];
    if (filters.refundRequest === "pending") {
      include.push({
        model: RefundRequest,
        as: "RefundRequests",
        attributes: [],
        where: { status: "pending" },
        required: true,
      });
    }

    return await Order.findAll({
      where: hasConditions ? where : undefined,
      include: include.length ? include : undefined,
      order: [["createdAt", "DESC"]],
      ...options,
    });
  },

  async create(data, options = {}) {
    return await Order.create(data, options);
  },

  async update(id, data, options = {}) {
    const order = await Order.findByPk(id, options);
    if (!order) return null;
    return await order.update(data, options);
  },

  async getLines(orderId, options = {}) {
    return await OrderLine.findAll({
      where: { orderId },
      include: options.include || defaultLineInclude,
      ...options,
    });
  },

  async addLine(orderId, productVariantId, price, quantity = 1, options = {}) {
    return await OrderLine.create(
      { orderId, productVariantId, price, quantity },
      options
    );
  },

  async createLineFromVariant(orderId, snapshot, quantity, options = {}) {
    const { eventId, ...createOptions } = options;
    return await OrderLine.create(
      {
        orderId,
        productVariantId: snapshot.productVariantId,
        title: snapshot.title,
        price: snapshot.price,
        quantity: quantity ?? 1,
        vatRate: snapshot.vatRate != null ? snapshot.vatRate : null,
        sku: snapshot.sku || null,
        kpd: snapshot.kpd || null,
        unit: snapshot.unit || null,
        stripeTaxRateId: snapshot.stripeTaxRateId || null,
        ...(eventId != null && { eventId }),
      },
      createOptions
    );
  },

  async unlinkUser(userId, options = {}) {
    if (!userId) return 0;
    const [affected] = await Order.update(
      { userId: null },
      { where: { userId }, ...options }
    );
    return affected;
  },
};
