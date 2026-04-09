const discountService = require("../../services/discount.service");
const cartRepo = require("../../repos/cart.repo");
const { DISCOUNT_APPLIES_TO } = require("../../constants/discount");

/**
 * Computes the cart subtotal limited to lines the discount applies to.
 * Cart lines already include Event info via the defaultLineInclude in cart.repo.
 *
 * @param {string|null} userId
 * @param {string|null} sessionId
 * @param {string}      applicableTo - 'all' | 'events' | 'products'
 * @returns {Promise<number>}
 */
async function getApplicableCartTotal(userId, sessionId, applicableTo) {
  const cart = userId
    ? await cartRepo.findByUser(userId)
    : await cartRepo.findBySessionId(sessionId);
  if (!cart) {
    const err = new Error("Cart not found.");
    err.status = 404;
    throw err;
  }

  const lines = await cartRepo.getLines(cart.id);
  if (!lines || lines.length === 0) {
    const err = new Error("Cart is empty.");
    err.status = 400;
    throw err;
  }

  let total = 0;
  for (const line of lines) {
    const variant = line.ProductVariant;
    if (!variant) continue;
    const isEvent = !!(variant.Event && variant.Event.id);
    if (applicableTo === DISCOUNT_APPLIES_TO.EVENTS && !isEvent) continue;
    if (applicableTo === DISCOUNT_APPLIES_TO.PRODUCTS && isEvent) continue;
    const priceRow = variant.ProductPrices?.[0];
    const price = priceRow ? Number(priceRow.amount) || 0 : 0;
    const qty = line.quantity || 1;
    total += price * qty;
  }
  return total;
}

module.exports = {
  /**
   * Preview a discount code for the current cart — read-only, no DB writes.
   *
   * For 'all' discounts: uses client-supplied cartTotal when present (attendee-aware
   * for legal/company users with multiple registrants) and falls back to the cart DB read.
   *
   * For 'events' or 'products' discounts: always computes from the cart DB so the
   * applicable subset total is accurate regardless of what the client sends.
   *
   * Returns { ok, code, type, value, applicableTo, amountDeducted, applicableTotal, discountedTotal }
   * or { ok: false, error }.
   */
  async apply(req, res) {
    try {
      const userId = req.user ? req.user.id : null;
      const sessionId = req.session && req.sessionID ? req.sessionID : null;
      if (!userId && !sessionId) {
        return res.status(401).json({ ok: false, error: "Session required." });
      }

      const code = req.body && req.body.code ? String(req.body.code).trim() : "";
      if (!code) {
        return res.status(400).json({ ok: false, error: "Invalid request." });
      }

      // Pre-fetch the discount to determine applicableTo before computing the
      // applicable cart total. validateCode will re-fetch with full validation.
      const preDiscount = await discountService.findByCode(code);
      const applicableTo = (preDiscount && preDiscount.applicableTo) || DISCOUNT_APPLIES_TO.ALL;

      let applicableTotal;
      const clientTotal = req.body.cartTotal != null ? Number(req.body.cartTotal) : null;

      if (applicableTo === DISCOUNT_APPLIES_TO.ALL && clientTotal != null && clientTotal > 0) {
        // Client-provided total is attendee-aware (checkout.js accounts for registrant rows).
        applicableTotal = clientTotal;
      } else {
        // Must fetch from DB to correctly filter by applicableTo scope.
        try {
          applicableTotal = await getApplicableCartTotal(userId, sessionId, applicableTo);
        } catch (cartErr) {
          return res.status(cartErr.status || 400).json({ ok: false, error: cartErr.message || "Could not read cart." });
        }
      }

      const result = await discountService.validateCode(code, applicableTotal);
      if (!result.ok) {
        return res.status(400).json({ ok: false, error: result.error });
      }

      const { discount, amountDeducted } = result;
      return res.json({
        ok: true,
        code: discount.code,
        type: discount.type,
        value: Number(discount.value),
        applicableTo: discount.applicableTo || "all",
        amountDeducted,
        applicableTotal,
        discountedTotal: Math.max(0, applicableTotal - amountDeducted),
      });
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ ok: false, error: err.message || "Could not apply discount." });
    }
  },
};
