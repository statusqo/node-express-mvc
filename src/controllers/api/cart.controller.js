const cartService = require("../../services/cart.service");
const { validateAddToCart, validateUpdateCartLine, validateRemoveFromCart } = require("../../validators/cart.schema");

function getUserIdAndSession(req) {
  const userId = req.user ? req.user.id : null;
  const sessionId = req.session && req.sessionID ? req.sessionID : null;
  if (!userId && !sessionId) {
    const err = new Error("Session required for cart.");
    err.status = 401;
    throw err;
  }
  return { userId, sessionId };
}

function getCartActorContext(req) {
  const userId = req.user ? req.user.id : null;
  return {
    isGuest: !userId,
    personType: req.user?.personType === "legal" ? "legal" : "private",
  };
}

function formatCartForApi(cart, lines, actorContext = {}) {
  const lineList = (lines || []).map((line) => {
    const variant = line.ProductVariant || {};
    const product = variant.Product || {};
    const priceRow = variant.ProductPrices?.[0];
    const price = priceRow ? Number(priceRow.amount) : 0;
    const qty = Number(line.quantity) || 1;
    const isEventVariant = Boolean(variant.Event && variant.Event.id);
    const isQuantityRestricted = isEventVariant && (actorContext.isGuest || actorContext.personType !== "legal");
    const showQuantityStepper = !isQuantityRestricted;
    const productVariantId = line.productVariantId || variant.id;
    const title = product.title || variant.title || "";
    return {
      productVariantId: productVariantId != null ? String(productVariantId) : "",
      title: String(title),
      price,
      quantity: qty,
      subtotal: price * qty,
      isEventVariant,
      isQuantityRestricted,
      showQuantityStepper,
      canIncrease: !isQuantityRestricted || qty < 1,
    };
  });
  const count = lineList.reduce((acc, l) => acc + l.quantity, 0);
  return { lines: lineList, count };
}

module.exports = {
  async add(req, res) {
    try {
      const { userId, sessionId } = getUserIdAndSession(req);
      const actorContext = getCartActorContext(req);
      const parsed = validateAddToCart(req.body);
      if (!parsed.ok) {
        return res.status(400).json({ error: "Invalid request." });
      }
      const { productVariantId, quantity } = parsed.data;
      await cartService.addToCart(userId, sessionId, productVariantId, quantity, actorContext);
      const { cart, lines } = await cartService.getCartWithLines(userId, sessionId);
      const payload = formatCartForApi(cart, lines, actorContext);
      return res.json(payload);
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || "Could not add to cart." });
    }
  },

  async getCart(req, res) {
    try {
      const { userId, sessionId } = getUserIdAndSession(req);
      const actorContext = getCartActorContext(req);
      const { cart, lines } = await cartService.getCartWithLines(userId, sessionId);
      const payload = formatCartForApi(cart, lines, actorContext);
      return res.json(payload);
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || "Could not load cart." });
    }
  },

  async update(req, res) {
    try {
      const { userId, sessionId } = getUserIdAndSession(req);
      const actorContext = getCartActorContext(req);
      const parsed = validateUpdateCartLine(req.body);
      if (!parsed.ok) {
        return res.status(400).json({ error: "Invalid request." });
      }
      const { productVariantId, quantity } = parsed.data;
      if (quantity <= 0) {
        await cartService.removeFromCart(userId, sessionId, productVariantId);
      } else {
        await cartService.setQuantity(userId, sessionId, productVariantId, quantity, actorContext);
      }
      const { cart, lines } = await cartService.getCartWithLines(userId, sessionId);
      const payload = formatCartForApi(cart, lines, actorContext);
      return res.json(payload);
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || "Could not update cart." });
    }
  },

  async remove(req, res) {
    try {
      const { userId, sessionId } = getUserIdAndSession(req);
      const actorContext = getCartActorContext(req);
      const parsed = validateRemoveFromCart(req.body);
      if (!parsed.ok) {
        return res.status(400).json({ error: "Invalid request." });
      }
      await cartService.removeFromCart(userId, sessionId, parsed.data.productVariantId);
      const { cart, lines } = await cartService.getCartWithLines(userId, sessionId);
      const payload = formatCartForApi(cart, lines, actorContext);
      return res.json(payload);
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message || "Could not remove item." });
    }
  },
};
