const cartRepo = require("../repos/cart.repo");
const productVariantRepo = require("../repos/productVariant.repo");

/**
 * Get or create cart for the current request (user or session).
 */
async function getOrCreateCart(userId, sessionId) {
  if (userId) return await cartRepo.getOrCreateForUser(userId);
  if (sessionId) return await cartRepo.getOrCreateForSession(sessionId);
  const err = new Error("Cart requires either userId or sessionId.");
  err.status = 400;
  throw err;
}

/**
 * Get cart lines with product variant details (for display).
 */
async function getCartWithLines(userId, sessionId) {
  const cart = await getOrCreateCart(userId, sessionId);
  if (!cart) return { cart: null, lines: [] };
  const lines = await cartRepo.getLines(cart.id);
  return { cart, lines };
}

/**
 * Add product variant to cart. Validates variant exists, is active and has a price.
 */
async function addToCart(userId, sessionId, productVariantId, quantity = 1) {
  const variant = await productVariantRepo.findById(productVariantId);
  if (!variant || !variant.active) {
    const err = new Error("Product variant not found or not available.");
    err.status = 404;
    throw err;
  }
  if (variant.quantity != null && variant.quantity < 1) {
    const err = new Error("This item is sold out.");
    err.status = 400;
    throw err;
  }
  const price = await productVariantRepo.getDefaultPrice(productVariantId);
  if (!price) {
    const err = new Error("Product variant has no price configured.");
    err.status = 400;
    throw err;
  }
  const cart = await getOrCreateCart(userId, sessionId);
  return await cartRepo.addLine(cart.id, productVariantId, quantity);
}

/**
 * Remove product variant from cart.
 */
async function removeFromCart(userId, sessionId, productVariantId) {
  const cart = await getOrCreateCart(userId, sessionId);
  return await cartRepo.removeLine(cart.id, productVariantId);
}

/**
 * Set line quantity. Remove line if quantity <= 0.
 */
async function setQuantity(userId, sessionId, productVariantId, quantity) {
  const cart = await getOrCreateCart(userId, sessionId);
  return await cartRepo.setLineQuantity(cart.id, productVariantId, quantity);
}

/**
 * Validate cart lines on render: remove any lines whose variant is inactive or sold out.
 * Returns the count and titles of removed items so the caller can flash a message.
 */
async function validateAndCleanCart(userId, sessionId) {
  const cart = userId
    ? await cartRepo.findByUser(userId)
    : await cartRepo.findBySessionId(sessionId);
  if (!cart) return { removedCount: 0, removedTitles: [] };

  const lines = await cartRepo.getLines(cart.id);
  if (!lines || lines.length === 0) return { removedCount: 0, removedTitles: [] };

  const removedTitles = [];
  for (const line of lines) {
    const variant = line.ProductVariant;
    const unavailable = !variant || variant.active === false;
    const soldOut = variant && variant.quantity != null && Number(variant.quantity) < 1;
    if (unavailable || soldOut) {
      await cartRepo.removeLine(cart.id, line.productVariantId);
      const title = variant?.title || line.productVariantId;
      removedTitles.push(title);
    }
  }
  return { removedCount: removedTitles.length, removedTitles };
}

/**
 * Clear cart for user or session. Used after successful payment when order was created with clearCart: false.
 */
async function clearCart(userId, sessionId) {
  const cart = userId
    ? await cartRepo.findByUser(userId)
    : await cartRepo.findBySessionId(sessionId);
  if (!cart) return;
  await cartRepo.clearLines(cart.id);
}

module.exports = {
  getOrCreateCart,
  getCartWithLines,
  addToCart,
  removeFromCart,
  setQuantity,
  clearCart,
  validateAndCleanCart,
};
