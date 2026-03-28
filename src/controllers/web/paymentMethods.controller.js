const paymentMethodService = require("../../services/paymentMethod.service");
const { validateAddPaymentMethod } = require("../../validators/paymentMethod.schema");
const { getDefaultGateway } = require("../../gateways");

function requireUser(req) {
  if (!req.user) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
  return req.user.id;
}

module.exports = {
  async list(req, res) {
    return res.redirect("/account");
  },

  /** POST /account/payment-methods/setup-intent — create SetupIntent for "Add card", return { clientSecret }. */
  async setupIntent(req, res) {
    const userId = requireUser(req);
    const gateway = getDefaultGateway();
    if (!gateway) {
      return res.status(503).json({ error: "Payment system is not configured." });
    }
    try {
      const result = await gateway.createSetupIntent(userId);
      const clientSecret = result.clientSecret;
      if (!clientSecret) {
        return res.status(500).json({ error: "Could not create setup." });
      }
      return res.json({ clientSecret });
    } catch (err) {
      const status = err.status ?? err.statusCode ?? 500;
      return res.status(status).json({ error: err.message || "Could not create setup." });
    }
  },

  /** POST /account/payment-methods — save a Stripe PaymentMethod (from confirmCardSetup) to our DB. Body: paymentMethodId, setAsDefault (optional). */
  async addPaymentMethod(req, res) {
    const userId = requireUser(req);
    const validation = validateAddPaymentMethod(req.body || {});
    if (!validation.ok) {
      return res.status(400).json({ error: validation.errors[0].message });
    }
    const { paymentMethodId, setAsDefault } = validation.data;
    const gateway = getDefaultGateway();
    if (!gateway) {
      return res.status(503).json({ error: "Payment system is not configured." });
    }
    try {
      const existing = await paymentMethodService.listByUser(userId);
      if (existing.some((p) => p.stripePaymentMethodId === paymentMethodId)) {
        return res.status(409).json({ error: "This card is already saved." });
      }
      await gateway.savePaymentMethod(userId, paymentMethodId);
      const list = await paymentMethodService.listByUser(userId);
      const pm = list.find((p) => p.stripePaymentMethodId === paymentMethodId);
      if (!pm) {
        return res.status(400).json({ error: "Could not save card." });
      }
      if (setAsDefault && list.length > 0) {
        await paymentMethodService.setDefault(pm.id, userId);
      }
      return res.status(201).json({ success: true });
    } catch (err) {
      const status = err.status ?? err.statusCode ?? 500;
      return res.status(status).json({ error: err.message || "Could not save card." });
    }
  },

  async setDefault(req, res) {
    const userId = requireUser(req);
    const id = req.params.id;
    const updated = await paymentMethodService.setDefault(id, userId);
    if (!updated) {
      const err = new Error("Payment method not found.");
      err.status = 404;
      throw err;
    }
    res.setFlash("success", "Default payment method updated.");
    return res.redirect("/account");
  },

  async delete(req, res) {
    const userId = requireUser(req);
    const deleted = await paymentMethodService.remove(req.params.id, userId);
    if (!deleted) {
      const err = new Error("Payment method not found.");
      err.status = 404;
      throw err;
    }
    res.setFlash("success", "Payment method removed.");
    return res.redirect("/account");
  },
};
