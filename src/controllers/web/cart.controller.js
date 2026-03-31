const cartService = require("../../services/cart.service");
const { validateAddToCart, validateUpdateCartLine, validateRemoveFromCart } = require("../../validators/cart.schema");
const config = require("../../config");

function getUserIdAndSession(req) {
  const userId = req.user ? req.user.id : null;
  const sessionId = req.session && req.sessionID ? req.sessionID : null;
  if (!userId && !sessionId) {
    const err = new Error("Session required for cart.");
    err.status = 400;
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

function getRedirectUrl(req, defaultPath = "/cart") {
  const referer = req.get("Referer");
  if (referer) {
    try {
      const url = new URL(referer);
      const base = config.baseUrl ? new URL(config.baseUrl) : null;
      if (!base || url.origin === base.origin) return referer;
    } catch (_) {}
  }
  return defaultPath;
}

module.exports = {
  async show(req, res) {
    const { userId, sessionId } = getUserIdAndSession(req);
    const actorContext = getCartActorContext(req);
    const { removedCount } = await cartService.validateAndCleanCart(userId, sessionId);
    if (removedCount > 0) {
      res.setFlash("error", "Some items in your cart are no longer available and have been removed.");
    }
    const { cart, lines } = await cartService.getCartWithLines(userId, sessionId);
    res.render("web/cart", {
      title: "Cart",
      cart,
      lines: lines || [],
      actorContext,
    });
  },

  async add(req, res) {
    const { userId, sessionId } = getUserIdAndSession(req);
    const actorContext = getCartActorContext(req);
    const parsed = validateAddToCart(req.body);
    if (!parsed.ok) {
      res.setFlash("error", "Invalid request. Please specify a valid item.");
      return res.redirect(getRedirectUrl(req, "/"));
    }
    try {
      await cartService.addToCart(userId, sessionId, parsed.data.productVariantId, parsed.data.quantity || 1, actorContext);
      res.setFlash("success", "Added to cart.");
    } catch (err) {
      if (err.status === 404) {
        res.setFlash("error", "Item not found or not available.");
      } else if (err.status === 400 && err.message) {
        res.setFlash("error", err.message);
      } else {
        res.setFlash("error", "Could not add to cart.");
      }
    }
    return res.redirect(getRedirectUrl(req, "/cart"));
  },

  async update(req, res) {
    const { userId, sessionId } = getUserIdAndSession(req);
    const actorContext = getCartActorContext(req);
    const parsed = validateUpdateCartLine(req.body);
    if (!parsed.ok) {
      res.setFlash("error", "Invalid request.");
      return res.redirect("/cart");
    }
    try {
      await cartService.setQuantity(userId, sessionId, parsed.data.productVariantId, parsed.data.quantity, actorContext);
      res.setFlash("success", "Cart updated.");
    } catch (err) {
      if (err.status === 400 && err.message) {
        res.setFlash("error", err.message);
      } else {
        res.setFlash("error", "Could not update cart.");
      }
    }
    return res.redirect("/cart");
  },

  async remove(req, res) {
    const { userId, sessionId } = getUserIdAndSession(req);
    const parsed = validateRemoveFromCart(req.body);
    if (!parsed.ok) {
      res.setFlash("error", "Invalid request.");
      return res.redirect("/cart");
    }
    try {
      await cartService.removeFromCart(userId, sessionId, parsed.data.productVariantId);
      res.setFlash("success", "Item removed from cart.");
    } catch (_) {
      res.setFlash("error", "Could not remove item.");
    }
    return res.redirect("/cart");
  },
};
