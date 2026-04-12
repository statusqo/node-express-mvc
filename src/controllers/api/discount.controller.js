const discountService = require("../../services/discount.service");

module.exports = {
  /**
   * Preview a discount code for the current cart — read-only, no DB writes.
   *
   * Uses the client-supplied cartTotal (attendee-aware for legal/company users
   * with multiple registrants). Falls back to zero if not provided.
   *
   * Returns { ok, code, type, value, amountDeducted, applicableTotal, discountedTotal }
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

      const clientTotal = req.body.cartTotal != null ? Number(req.body.cartTotal) : null;
      const applicableTotal = clientTotal != null && clientTotal > 0 ? clientTotal : 0;

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
