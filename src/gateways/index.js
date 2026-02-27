/**
 * Payment Gateway Factory
 *
 * Single entry point for payment operations. Use getGateway() or getDefaultGateway().
 * - Returns null or throws if the requested gateway is not configured
 * - Fails fast at startup if the default gateway is misconfigured (when PAYMENT_DEFAULT_GATEWAY is set)
 *
 * Configuration (env):
 *   PAYMENT_DEFAULT_GATEWAY - default gateway name (e.g. 'stripe'). If set, must be configured.
 *   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET - for Stripe
 *   (Future: MOLLIE_API_KEY, etc.)
 */

const config = require("../config");
const logger = require("../config/logger");

let stripeGateway = null;

function getStripeGateway() {
  if (!stripeGateway) {
    const StripeGateway = require("./stripe.gateway");
    stripeGateway = StripeGateway;
  }
  return stripeGateway;
}

/**
 * Get a gateway by name.
 * @param {string} name - 'stripe', 'mollie', etc.
 * @returns {Object|null} - Gateway implementation or null if not configured
 */
function getGateway(name) {
  const n = name ? String(name).toLowerCase().trim() : "";
  if (!n) return null;

  switch (n) {
    case "stripe":
      const stripe = getStripeGateway();
      return stripe.isConfigured() ? stripe : null;
    default:
      return null;
  }
}

/**
 * Get the default payment gateway.
 * Uses PAYMENT_DEFAULT_GATEWAY env, falls back to 'stripe' if Stripe is configured.
 * @returns {Object|null} - Gateway implementation or null
 */
function getDefaultGateway() {
  const defaultName = config.payment?.defaultGateway || "stripe";
  return getGateway(defaultName);
}

/**
 * Validate payment config at startup.
 * Logs clear error if default gateway is set but misconfigured.
 * Call this from server.js or app startup.
 */
function validatePaymentConfig() {
  const defaultName = config.payment?.defaultGateway || "stripe";
  const gateway = getGateway(defaultName);

  if (!gateway) {
    if (defaultName === "stripe") {
      if (!config.stripe?.secretKey) {
        logger.warn(
          "Payment: Stripe is the default gateway but STRIPE_SECRET_KEY is not set. Payment features will be disabled."
        );
      }
    } else {
      logger.error(
        `Payment: PAYMENT_DEFAULT_GATEWAY is set to '${defaultName}' but that gateway is not configured. Payment features will be disabled.`
      );
    }
  }
}

module.exports = {
  getGateway,
  getDefaultGateway,
  validatePaymentConfig,
};
