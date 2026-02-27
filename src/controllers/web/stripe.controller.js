const { getGateway } = require("../../gateways");
const logger = require("../../config/logger");

module.exports = {
  async webhook(req, res) {
    const sig = req.headers["stripe-signature"];
    const stripeGateway = getGateway("stripe");

    if (!stripeGateway || !stripeGateway.isConfigured()) {
      logger.error("Stripe webhook received but Stripe is not configured");
      return res.status(500).json({ error: "Stripe not configured" });
    }

    let event;
    try {
      event = stripeGateway.constructWebhookEvent(req.body, sig);
    } catch (err) {
      const status = err.status ?? err.statusCode ?? 400;
      logger.error("Stripe webhook signature verification failed", { error: err.message });
      return res.status(status >= 500 ? 500 : 400).send(`Webhook Error: ${err.message}`);
    }

    try {
      await stripeGateway.handleWebhook(event);
      res.json({ received: true });
    } catch (err) {
      const status = err.status ?? err.statusCode ?? 500;
      logger.error("Error processing Stripe webhook", { error: err, eventType: event?.type });
      res.status(status >= 500 ? 500 : 400).json({ error: "Webhook processing failed" });
    }
  },
};
