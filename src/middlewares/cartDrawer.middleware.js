const cartService = require("../services/cart.service");

/**
 * Injects cart summary into res.locals for the cart drawer in the layout.
 * Runs only when session exists; fails softly so the rest of the app is unaffected.
 */
async function injectCartDrawer(req, res, next) {
  try {
    const userId = req.user ? req.user.id : null;
    const sessionId = req.session && req.sessionID ? req.sessionID : null;
    if (!sessionId && !userId) {
      res.locals.cartDrawer = { lines: [], count: 0 };
      return next();
    }
    const { cart, lines } = await cartService.getCartWithLines(userId, sessionId);
    const count = (lines || []).reduce((acc, line) => acc + (line.quantity || 0), 0);
    res.locals.cartDrawer = { cart, lines: lines || [], count };
  } catch (_) {
    res.locals.cartDrawer = { lines: [], count: 0 };
  }
  next();
}

module.exports = { injectCartDrawer };
