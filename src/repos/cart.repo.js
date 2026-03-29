const { Cart, CartLine, ProductVariant, Product, ProductPrice, TaxRate } = require("../models");

const defaultLineInclude = [
  {
    model: ProductVariant,
    as: "ProductVariant",
    attributes: ["id", "title", "productId"],
    required: true,
    include: [
      { model: Product, as: "Product", attributes: ["id", "title", "slug", "isPhysical"], include: [{ model: TaxRate, as: "TaxRate", attributes: ["percentage"], required: false }] },
      { model: ProductPrice, as: "ProductPrices", where: { isDefault: true }, required: false, limit: 1, attributes: ["amount", "currency"] },
    ],
  },
];

module.exports = {
  async findById(id, options = {}) {
    if (!id) return null;
    return await Cart.findByPk(id, options);
  },

  async findByUser(userId, options = {}) {
    if (!userId) return null;
    return await Cart.findOne({
      where: { userId },
      ...options,
    });
  },

  async findAllByUserId(userId, options = {}) {
    if (!userId) return [];
    return await Cart.findAll({
      where: { userId },
      ...options,
    });
  },

  async findBySessionId(sessionId, options = {}) {
    if (!sessionId) return null;
    return await Cart.findOne({
      where: { sessionId },
      ...options,
    });
  },

  async create(data, options = {}) {
    return await Cart.create(data, options);
  },

  async getOrCreateForUser(userId, options = {}) {
    let cart = await this.findByUser(userId, options);
    if (!cart) cart = await this.create({ userId }, options);
    return cart;
  },

  async getOrCreateForSession(sessionId, options = {}) {
    let cart = await this.findBySessionId(sessionId, options);
    if (!cart) cart = await this.create({ sessionId }, options);
    return cart;
  },

  async getLines(cartId, options = {}) {
    return await CartLine.findAll({
      where: { cartId },
      include: options.include || defaultLineInclude,
      ...options,
    });
  },

  async addLine(cartId, productVariantId, quantity = 1, options = {}) {
    const [line, created] = await CartLine.findOrCreate({
      where: { cartId, productVariantId },
      defaults: { quantity },
      ...options,
    });
    if (!created) {
      line.quantity += quantity;
      await line.save(options);
    }
    return line;
  },

  async removeLine(cartId, productVariantId, options = {}) {
    const deleted = await CartLine.destroy({
      where: { cartId, productVariantId },
      ...options,
    });
    return deleted > 0;
  },

  async setLineQuantity(cartId, productVariantId, quantity, options = {}) {
    const line = await CartLine.findOne({ where: { cartId, productVariantId }, ...options });
    if (!line) return null;
    if (quantity <= 0) {
      await line.destroy(options);
      return null;
    }
    line.quantity = quantity;
    await line.save(options);
    return line;
  },

  async clearLines(cartId, options = {}) {
    return await CartLine.destroy({ where: { cartId }, ...options });
  },

  async removeLinesByVariantId(productVariantId, options = {}) {
    return await CartLine.destroy({ where: { productVariantId }, ...options });
  },

  async delete(cartId, options = {}) {
    const cart = await Cart.findByPk(cartId, options);
    if (!cart) return false;
    await cart.destroy(options);
    return true;
  },
};
