/**
 * Payment Gateway Interface
 *
 * All payment gateways (Stripe, Mollie, etc.) must implement this interface.
 * Methods are documented with required vs optional parameters.
 *
 * Supported methods per gateway:
 * - createPaymentIntent: Stripe ✓, Mollie (may differ)
 * - createSetupIntent: Stripe ✓, Mollie (optional - some gateways don't support saved cards)
 * - createCheckoutSession: Stripe ✓ (redirect flow)
 * - savePaymentMethod: Stripe ✓ (optional for gateways without saved cards)
 * - detachPaymentMethod: Stripe ✓
 * - validatePaymentIntent: Stripe ✓ (for complete-order flow)
 * - getPaymentMethodDetails: Stripe ✓
 * - constructWebhookEvent / handleWebhook: per-gateway (webhook routing is gateway-specific)
 *
 * Error handling: All methods should use normalizeError() from ./errors and throw
 * errors with .status, .code, .retryable for consistent API responses.
 */

const { normalizeError, toError } = require('./errors');

/**
 * @typedef {Object} CreatePaymentIntentResult
 * @property {boolean} success
 * @property {string} [clientSecret] - For Stripe.js confirmCardPayment
 * @property {Object} [error] - Present when success is false
 */

/**
 * @typedef {Object} CreateSetupIntentResult
 * @property {boolean} success
 * @property {string} [clientSecret]
 * @property {Object} [error]
 */

/**
 * @typedef {Object} CreateCheckoutSessionResult
 * @property {boolean} success
 * @property {string} [url] - Redirect URL
 * @property {string} [sessionId]
 * @property {Object} [error]
 */

/**
 * @typedef {Object} SavePaymentMethodResult
 * @property {boolean} saved - true if new row created, false if already present
 */

/**
 * @typedef {Object} ValidatePaymentIntentResult
 * @property {Object} paymentIntent - Gateway's payment intent object (with payment_method)
 * @property {string} paymentMethodId - From payment_intent for saving card
 */

/**
 * @typedef {Object} PaymentMethodDetails
 * @property {string} id
 * @property {string} last4
 * @property {string} brand
 * @property {number} expiryMonth
 * @property {number} expiryYear
 */

/**
 * Base interface - gateways implement the methods they support.
 * Use getGateway() to obtain a configured gateway instance.
 *
 * @interface PaymentGateway
 */
const gatewayInterface = {
  /**
   * Gateway name (e.g. 'stripe', 'mollie')
   * @returns {string}
   */
  name: () => 'unknown',

  /**
   * Whether the gateway is configured and ready.
   * @returns {boolean}
   */
  isConfigured: () => false,

  /**
   * Create a PaymentIntent for the cart (no order yet). Payment-first flow.
   * @param {number} amount - Amount in major currency units (e.g. USD dollars)
   * @param {string} currency - Currency code (e.g. 'usd')
   * @param {string|null} userId - User ID if logged in
   * @param {string|null} sessionId - Session ID for guest
   * @param {Object} [options] - { email?, paymentMethodId?, idempotencyKey? }
   * @returns {Promise<CreatePaymentIntentResult>}
   */
  createPaymentIntent: async (amount, currency, userId, sessionId, options = {}) => {
    throw toError(normalizeError(new Error('Not implemented'), 'interface'));
  },

  /**
   * Create a SetupIntent for saving a card (no charge). Optional: some gateways don't support saved cards.
   * @param {string} userId - Required
   * @param {Object} [options] - { idempotencyKey? }
   * @returns {Promise<CreateSetupIntentResult>}
   */
  createSetupIntent: async (userId, options = {}) => {
    throw toError(normalizeError(new Error('Not implemented'), 'interface'));
  },

  /**
   * Create a Checkout Session for redirect flow. Optional: some gateways only support inline flow.
   * @param {string} orderId
   * @param {string|null} userId
   * @param {string|null} sessionId
   * @returns {Promise<CreateCheckoutSessionResult>}
   */
  createCheckoutSession: async (orderId, userId, sessionId) => {
    throw toError(normalizeError(new Error('Not implemented'), 'interface'));
  },

  /**
   * Save a payment method to DB after successful payment. Optional: only for gateways with saved cards.
   * @param {string} userId
   * @param {string} gatewayPaymentMethodId - e.g. pm_xxx from Stripe
   * @returns {Promise<SavePaymentMethodResult>}
   */
  savePaymentMethod: async (userId, gatewayPaymentMethodId) => {
    throw toError(normalizeError(new Error('Not implemented'), 'interface'));
  },

  /**
   * Detach a payment method from the gateway (e.g. when user removes card).
   * @param {string} gatewayPaymentMethodId
   * @returns {Promise<void>}
   */
  detachPaymentMethod: async (gatewayPaymentMethodId) => {
    throw toError(normalizeError(new Error('Not implemented'), 'interface'));
  },

  /**
   * Validate a PaymentIntent for complete-order flow. Must succeed and match userId/sessionId.
   * @param {string} paymentIntentId
   * @param {string|null} userId
   * @param {string|null} sessionId
   * @returns {Promise<ValidatePaymentIntentResult>}
   */
  validatePaymentIntent: async (paymentIntentId, userId, sessionId) => {
    throw toError(normalizeError(new Error('Not implemented'), 'interface'));
  },

  /**
   * Get payment method details (last4, brand, expiry) for display.
   * @param {string} gatewayPaymentMethodId
   * @returns {Promise<PaymentMethodDetails|null>}
   */
  getPaymentMethodDetails: async (gatewayPaymentMethodId) => {
    return null;
  },

  /**
   * Create a PaymentIntent for an existing order (inline payment on checkout page).
   * @param {string} orderId
   * @param {string|null} userId
   * @param {string|null} sessionId
   * @returns {Promise<CreatePaymentIntentResult>}
   */
  createPaymentIntentForOrder: async (orderId, userId, sessionId) => {
    throw toError(normalizeError(new Error('Not implemented'), 'interface'));
  },

  /**
   * Verify webhook signature. Throws if invalid.
   * @param {Buffer|string} rawBody
   * @param {string} signature
   * @returns {Object} - Parsed event
   */
  constructWebhookEvent: (rawBody, signature) => {
    throw new Error('Not implemented');
  },

  /**
   * Handle webhook event (checkout.session.completed, payment_intent.succeeded, etc.)
   * @param {Object} event
   * @returns {Promise<void>}
   */
  handleWebhook: async (event) => { /* no-op */ },
};

module.exports = gatewayInterface;
