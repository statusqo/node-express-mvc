/**
 * Stripe Payment Gateway Implementation
 *
 * Implements the payment gateway interface with:
 * - Error normalization (card_declined, insufficient_funds, rate_limit, etc.)
 * - 30s timeout on all gateway calls
 * - Structured logging (no raw card data, safe identifiers only)
 * - Idempotency keys for charge/setup operations
 * - Webhook signature verification
 *
 * Metrics: Add Prometheus counters here, e.g.:
 *   payment_operations_total{gateway="stripe",operation="createPaymentIntent",success="true"}
 *   payment_operation_duration_seconds{gateway="stripe",operation="createPaymentIntent"}
 */

const Stripe = require("stripe");
const config = require("../config");
const orderService = require("../services/order.service");
const orderRepo = require("../repos/order.repo");
const orderLineRepo = require("../repos/orderLine.repo");
const userRepo = require("../repos/user.repo");
const transactionRepo = require("../repos/transaction.repo");
const userGatewayProfileRepo = require("../repos/userGatewayProfile.repo");
const logger = require("../config/logger");

const { normalizeError, toError } = require("./errors");
const { PAYMENT_STATUS } = require("../constants/order");

const GATEWAY_NAME = "stripe";
const TIMEOUT_MS = 30000;

function createStripeClient() {
  if (!config.stripe.secretKey) return null;
  const opts = config.stripe.apiVersion ? { apiVersion: config.stripe.apiVersion } : {};
  return new Stripe(config.stripe.secretKey, opts);
}

const stripe = createStripeClient();

if (!stripe) {
  logger.warn("Stripe secret key not configured. Stripe gateway will be disabled.");
}

/**
 * Wrap a promise with timeout. Rejects with AbortError-like error on timeout.
 */
function withTimeout(promise, ms = TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Gateway request timed out after ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * Safe identifier for logging (last 4 chars of ID, never full token/card).
 */
function safeId(id) {
  if (!id || typeof id !== "string") return "(none)";
  if (id.length <= 4) return "***";
  return id.slice(-4);
}

/**
 * Log payment operation in structured format.
 * @param {Object} params - { operation, userId?, orderId?, success, durationMs, errorCode? }
 */
function logPaymentOp(params) {
  const { operation, userId, orderId, success, durationMs, errorCode } = params;
  const entry = {
    operation,
    gateway: GATEWAY_NAME,
    userId: userId ? String(userId) : undefined,
    orderId: orderId ? String(orderId) : undefined,
    success,
    durationMs,
    errorCode: errorCode || undefined,
  };
  if (success) {
    logger.info("Payment operation", entry);
  } else if (entry.errorCode && ["rate_limit", "network_error"].includes(entry.errorCode)) {
    logger.warn("Payment operation retryable failure", entry);
  } else {
    logger.error("Payment operation failed", entry);
  }
  // Metrics: increment counter here, e.g. payment_operations_total.inc(entry)
}

/**
 * Get or create Stripe customer for user. Uses user_gateway_profiles; falls back to users.stripeCustomerId during migration.
 */
async function getOrCreateStripeCustomer(userId, email) {
  const user = await userRepo.findById(userId);
  if (!user) {
    throw toError(normalizeError(new Error("User not found."), GATEWAY_NAME));
  }

  const preferredEmail = email || user.email;

  // Prefer user_gateway_profiles
  let profile = await userGatewayProfileRepo.findByUserAndGateway(userId, GATEWAY_NAME);
  if (profile) {
    try {
      const customer = await withTimeout(stripe.customers.retrieve(profile.externalCustomerId));
      if (preferredEmail && !customer.email) {
        await withTimeout(stripe.customers.update(customer.id, { email: preferredEmail }));
      }
      return customer;
    } catch (err) {
      logger.warn("Stripe customer not found, creating new one", {
        externalCustomerIdLast4: safeId(profile.externalCustomerId),
        userId,
      });
    }
  }

  // Fallback: users.stripeCustomerId (during migration)
  if (user.stripeCustomerId) {
    try {
      const customer = await withTimeout(stripe.customers.retrieve(user.stripeCustomerId));
      await userGatewayProfileRepo.upsert({
        userId,
        gateway: GATEWAY_NAME,
        externalCustomerId: customer.id,
      });
      return customer;
    } catch (err) {
      logger.warn("Stripe customer from users table not found", {
        stripeCustomerIdLast4: safeId(user.stripeCustomerId),
        userId,
      });
    }
  }

  const customer = await withTimeout(
    stripe.customers.create({
      email: preferredEmail,
      metadata: { userId: String(userId) },
    })
  );

  await userGatewayProfileRepo.upsert({
    userId,
    gateway: GATEWAY_NAME,
    externalCustomerId: customer.id,
  });

  return customer;
}

async function createPaymentIntentForCart(amount, currency, userId, sessionId, options = {}) {
  const start = Date.now();
  if (!stripe) {
    const err = toError(normalizeError(new Error("Stripe is not configured."), GATEWAY_NAME));
    err.status = 500;
    throw err;
  }

  const amountCents = Math.round(Number(amount) * 100);
  if (amountCents < 1) {
    const err = toError(normalizeError(new Error("Amount must be greater than zero."), GATEWAY_NAME));
    err.status = 400;
    throw err;
  }

  const currencyNorm = (currency || "usd").toString().toLowerCase();
  const email = options.email != null ? options.email : null;
  const paymentMethodId = options.paymentMethodId ? String(options.paymentMethodId).trim() : null;
  const idempotencyKey = options.idempotencyKey ? String(options.idempotencyKey).trim() : null;
  const useSavedCard = paymentMethodId && userId;

  try {
    if (useSavedCard) {
      const customer = await getOrCreateStripeCustomer(userId, email);
      try {
        const pm = await withTimeout(stripe.paymentMethods.retrieve(paymentMethodId));
        const pmCustomerId = typeof pm.customer === "string" ? pm.customer : pm.customer?.id;
        const ourCustomerId = String(customer.id || "").trim();
        const theirCustomerId = pmCustomerId ? String(pmCustomerId).trim() : null;
        if (theirCustomerId && theirCustomerId !== ourCustomerId) {
          await withTimeout(stripe.paymentMethods.detach(paymentMethodId));
          await withTimeout(stripe.paymentMethods.attach(paymentMethodId, { customer: ourCustomerId }));
        } else if (!theirCustomerId) {
          await withTimeout(stripe.paymentMethods.attach(paymentMethodId, { customer: ourCustomerId }));
        }
      } catch (attachErr) {
        const norm = normalizeError(attachErr, GATEWAY_NAME);
        logPaymentOp({
          operation: "createPaymentIntent",
          userId,
          success: false,
          durationMs: Date.now() - start,
          errorCode: norm.code,
        });
        throw toError(norm);
      }

      const params = {
        amount: amountCents,
        currency: currencyNorm,
        customer: customer.id,
        payment_method: paymentMethodId,
        confirm: false,
        payment_method_types: ["card"],
        metadata: {
          userId: userId ? String(userId) : "",
          sessionId: sessionId ? String(sessionId) : "",
        },
        automatic_payment_methods: { enabled: false },
      };
      if (idempotencyKey) params.idempotency_key = idempotencyKey;

      const paymentIntent = await withTimeout(stripe.paymentIntents.create(params));
      logPaymentOp({
        operation: "createPaymentIntent",
        userId,
        success: true,
        durationMs: Date.now() - start,
      });
      return { success: true, clientSecret: paymentIntent.client_secret };
    }

    const params = {
      amount: amountCents,
      currency: currencyNorm,
      metadata: {
        userId: userId ? String(userId) : "",
        sessionId: sessionId ? String(sessionId) : "",
      },
      automatic_payment_methods: { enabled: true },
    };
    if (userId) {
      const customer = await getOrCreateStripeCustomer(userId, email);
      params.customer = customer.id;
      params.setup_future_usage = "off_session";
    } else if (email && typeof email === "string" && email.trim()) {
      params.receipt_email = email.trim();
    }
    if (idempotencyKey) params.idempotency_key = idempotencyKey;

    const paymentIntent = await withTimeout(stripe.paymentIntents.create(params));
    logPaymentOp({
      operation: "createPaymentIntent",
      userId,
      success: true,
      durationMs: Date.now() - start,
    });
    return { success: true, clientSecret: paymentIntent.client_secret };
  } catch (err) {
    const norm = normalizeError(err, GATEWAY_NAME);
    norm.status = norm.status || 500;
    logPaymentOp({
      operation: "createPaymentIntent",
      userId,
      success: false,
      durationMs: Date.now() - start,
      errorCode: norm.code,
    });
    const e = toError(norm);
    e.status = norm.status;
    throw e;
  }
}

async function createSetupIntent(userId, options = {}) {
  const start = Date.now();
  if (!stripe) {
    const err = toError(normalizeError(new Error("Stripe is not configured."), GATEWAY_NAME));
    err.status = 500;
    throw err;
  }

  const idempotencyKey = options.idempotencyKey ? String(options.idempotencyKey).trim() : null;

  try {
    const customer = await getOrCreateStripeCustomer(userId);
    const params = {
      customer: customer.id,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: { userId: String(userId) },
    };
    if (idempotencyKey) params.idempotency_key = idempotencyKey;

    const setupIntent = await withTimeout(stripe.setupIntents.create(params));
    logPaymentOp({
      operation: "createSetupIntent",
      userId,
      success: true,
      durationMs: Date.now() - start,
    });
    return { success: true, clientSecret: setupIntent.client_secret };
  } catch (err) {
    const norm = normalizeError(err, GATEWAY_NAME);
    logPaymentOp({
      operation: "createSetupIntent",
      userId,
      success: false,
      durationMs: Date.now() - start,
      errorCode: norm.code,
    });
    const e = toError(norm);
    e.status = norm.status || 500;
    throw e;
  }
}

async function createCheckoutSession(orderId, userId, sessionId) {
  const start = Date.now();
  if (!stripe) {
    const err = toError(normalizeError(new Error("Stripe is not configured."), GATEWAY_NAME));
    err.status = 500;
    throw err;
  }

  const order = await orderRepo.findById(orderId);
  if (!order) {
    const err = toError(normalizeError(new Error("Order not found."), GATEWAY_NAME));
    err.status = 404;
    throw err;
  }

  if (order.userId && order.userId !== userId) {
    const err = toError(normalizeError(new Error("Unauthorized."), GATEWAY_NAME));
    err.status = 403;
    throw err;
  }
  if (order.sessionId && order.sessionId !== sessionId) {
    const err = toError(normalizeError(new Error("Unauthorized."), GATEWAY_NAME));
    err.status = 403;
    throw err;
  }

  if (order.paymentStatus !== "pending") {
    const err = toError(normalizeError(new Error("Order is not pending payment."), GATEWAY_NAME));
    err.status = 400;
    throw err;
  }

  const lines = await orderRepo.getLines(order.id);
  const lineItems = [];
  for (const line of lines) {
    const variant = line.ProductVariant;
    const product = variant?.Product;
    const title = (product && product.title) || (variant && variant.title) || "Item";
    lineItems.push({
      price_data: {
        currency: order.currency.toLowerCase(),
        product_data: {
          name: title,
          description: (product && product.description) || undefined,
        },
        unit_amount: Math.round(Number(line.price) * 100),
      },
      quantity: line.quantity || 1,
    });
  }

  if (lineItems.length === 0) {
    const err = toError(normalizeError(new Error("Order has no items."), GATEWAY_NAME));
    err.status = 400;
    throw err;
  }

  let customerId = null;
  if (userId) {
    const user = await userRepo.findById(userId);
    if (user) {
      const customer = await getOrCreateStripeCustomer(userId, user.email);
      customerId = customer.id;
    }
  }

  const sessionParams = {
    payment_method_types: ["card"],
    line_items: lineItems,
    mode: "payment",
    success_url: `${config.baseUrl}/orders/${order.id}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.baseUrl}/orders/${order.id}`,
    metadata: { orderId: String(order.id) },
  };
  if (customerId) {
    sessionParams.customer = customerId;
  } else {
    sessionParams.customer_creation = "if_required";
  }

  try {
    const session = await withTimeout(stripe.checkout.sessions.create(sessionParams));
    await orderRepo.update(order.id, { stripePaymentIntentId: session.id });
    await orderService.recordPaymentAttempt(
      order.id,
      Number(order.total),
      order.currency,
      GATEWAY_NAME,
      session.id,
      { sessionId: session.id, type: "checkout_session" }
    );
    logPaymentOp({
      operation: "createCheckoutSession",
      userId,
      orderId,
      success: true,
      durationMs: Date.now() - start,
    });
    return { success: true, sessionId: session.id, url: session.url };
  } catch (err) {
    const norm = normalizeError(err, GATEWAY_NAME);
    logPaymentOp({
      operation: "createCheckoutSession",
      userId,
      orderId,
      success: false,
      durationMs: Date.now() - start,
      errorCode: norm.code,
    });
    const e = toError(norm);
    e.status = norm.status || 500;
    throw e;
  }
}

async function savePaymentMethod(userId, gatewayPaymentMethodId) {
  const start = Date.now();
  if (!stripe) {
    const err = toError(normalizeError(new Error("Stripe is not configured."), GATEWAY_NAME));
    err.status = 500;
    throw err;
  }

  const id = typeof gatewayPaymentMethodId === "string" ? gatewayPaymentMethodId.trim() : "";
  if (!id || id.indexOf("pm_") !== 0) {
    const err = toError(normalizeError(new Error("Invalid payment method id."), GATEWAY_NAME));
    err.status = 400;
    throw err;
  }

  const paymentMethodService = require("../services/paymentMethod.service");
  const user = await userRepo.findById(userId);
  if (!user) {
    const err = toError(normalizeError(new Error("User not found."), GATEWAY_NAME));
    err.status = 404;
    throw err;
  }

  try {
    const customer = await getOrCreateStripeCustomer(userId, user.email);
    const pm = await withTimeout(stripe.paymentMethods.retrieve(id));
    if (!pm || pm.type !== "card") {
      const err = toError(normalizeError(new Error("Invalid payment method."), GATEWAY_NAME));
      err.status = 400;
      throw err;
    }

    const pmCustomerId = typeof pm.customer === "string" ? pm.customer : pm.customer?.id;
    const ourCustomerId = String(customer.id || "").trim();
    const theirCustomerId = pmCustomerId ? String(pmCustomerId).trim() : null;

    if (theirCustomerId && theirCustomerId !== ourCustomerId) {
      try {
        await withTimeout(stripe.paymentMethods.detach(id));
        await withTimeout(stripe.paymentMethods.attach(id, { customer: ourCustomerId }));
      } catch (moveErr) {
        logger.warn("savePaymentMethod: could not move PM to user customer", {
          userId,
          paymentMethodIdLast4: safeId(id),
          error: moveErr.message,
        });
        const err = toError(normalizeError(new Error("Payment method does not belong to this account."), GATEWAY_NAME));
        err.status = 403;
        throw err;
      }
    } else if (!theirCustomerId) {
      try {
        await withTimeout(stripe.paymentMethods.attach(id, { customer: ourCustomerId }));
      } catch (attachErr) {
        if (attachErr.code !== "resource_already_attached_to_customer") throw attachErr;
      }
    }

    const details = await getPaymentMethodDetails(id);
    if (!details) {
      const err = toError(normalizeError(new Error("Could not read card details from Stripe."), GATEWAY_NAME));
      err.status = 400;
      throw err;
    }

    const existing = await paymentMethodService.listByUser(userId);
    if (existing.some((p) => p.gatewayToken === id)) {
      logPaymentOp({ operation: "savePaymentMethod", userId, success: true, durationMs: Date.now() - start });
      return { saved: false };
    }

    const sameCard = existing.find(
      (p) =>
        String(p.last4 || "") === String(details.last4 || "") &&
        String(p.brand || "").toLowerCase() === String(details.brand || "").toLowerCase() &&
        Number(p.expiryMonth) === Number(details.expiryMonth) &&
        Number(p.expiryYear) === Number(details.expiryYear)
    );
    if (sameCard) {
      await paymentMethodService.update(sameCard.id, userId, { gatewayToken: id });
      logPaymentOp({ operation: "savePaymentMethod", userId, success: true, durationMs: Date.now() - start });
      return { saved: false };
    }

    await paymentMethodService.create(userId, {
      type: "card",
      gateway: GATEWAY_NAME,
      gatewayToken: id,
      last4: details.last4,
      brand: details.brand,
      expiryMonth: details.expiryMonth,
      expiryYear: details.expiryYear,
      isDefault: existing.length === 0,
    });
    logPaymentOp({ operation: "savePaymentMethod", userId, success: true, durationMs: Date.now() - start });
    return { saved: true };
  } catch (err) {
    const norm = normalizeError(err, GATEWAY_NAME);
    logPaymentOp({
      operation: "savePaymentMethod",
      userId,
      success: false,
      durationMs: Date.now() - start,
      errorCode: norm.code,
    });
    const e = toError(norm);
    e.status = norm.status || 500;
    throw e;
  }
}

async function detachPaymentMethod(gatewayPaymentMethodId) {
  if (!stripe) {
    const err = toError(normalizeError(new Error("Stripe is not configured."), GATEWAY_NAME));
    err.status = 500;
    throw err;
  }
  await withTimeout(stripe.paymentMethods.detach(gatewayPaymentMethodId));
}

async function validatePaymentIntent(paymentIntentId, userId, sessionId) {
  const start = Date.now();
  if (!stripe) {
    const err = toError(normalizeError(new Error("Stripe is not configured."), GATEWAY_NAME));
    err.status = 500;
    throw err;
  }

  try {
    const paymentIntent = await withTimeout(
      stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["payment_method"] })
    );
    if (paymentIntent.status !== "succeeded") {
      const err = toError(normalizeError(new Error("Payment has not succeeded."), GATEWAY_NAME));
      err.status = 400;
      throw err;
    }
    const meta = paymentIntent.metadata || {};
    const metaUserId = meta.userId != null ? String(meta.userId) : "";
    const metaSessionId = meta.sessionId != null ? String(meta.sessionId) : "";
    if ((userId && metaUserId !== String(userId)) || (sessionId && metaSessionId !== String(sessionId))) {
      const err = toError(normalizeError(new Error("Payment does not belong to this session."), GATEWAY_NAME));
      err.status = 403;
      throw err;
    }
    const pm = paymentIntent.payment_method;
    const paymentMethodId =
      typeof pm === "string" ? pm : pm && typeof pm.id === "string" ? pm.id : null;
    logPaymentOp({
      operation: "validatePaymentIntent",
      userId,
      success: true,
      durationMs: Date.now() - start,
    });
    return { paymentIntent, paymentMethodId };
  } catch (err) {
    const norm = normalizeError(err, GATEWAY_NAME);
    logPaymentOp({
      operation: "validatePaymentIntent",
      userId,
      success: false,
      durationMs: Date.now() - start,
      errorCode: norm.code,
    });
    const e = toError(norm);
    e.status = norm.status || 500;
    throw e;
  }
}

async function getPaymentMethodDetails(gatewayPaymentMethodId) {
  if (!stripe) return null;
  try {
    const pm = await withTimeout(stripe.paymentMethods.retrieve(gatewayPaymentMethodId));
    if (!pm || pm.type !== "card" || !pm.card) return null;
    return {
      id: pm.id,
      last4: pm.card.last4,
      brand: pm.card.brand,
      expiryMonth: pm.card.exp_month,
      expiryYear: pm.card.exp_year,
    };
  } catch (err) {
    logger.warn("Stripe getPaymentMethodDetails failed", {
      paymentMethodIdLast4: safeId(gatewayPaymentMethodId),
      error: err.message,
    });
    return null;
  }
}

async function createPaymentIntentForOrder(orderId, userId, sessionId, options = {}) {
  const start = Date.now();
  if (!stripe) {
    const err = toError(normalizeError(new Error("Stripe is not configured."), GATEWAY_NAME));
    err.status = 500;
    throw err;
  }

  const order = await orderRepo.findById(orderId);
  if (!order) {
    const err = toError(normalizeError(new Error("Order not found."), GATEWAY_NAME));
    err.status = 404;
    throw err;
  }
  if (order.userId && order.userId !== userId) {
    const err = toError(normalizeError(new Error("Unauthorized."), GATEWAY_NAME));
    err.status = 403;
    throw err;
  }
  if (order.sessionId && order.sessionId !== sessionId) {
    const err = toError(normalizeError(new Error("Unauthorized."), GATEWAY_NAME));
    err.status = 403;
    throw err;
  }
  if (order.paymentStatus !== "pending") {
    const err = toError(normalizeError(new Error("Order is not pending payment."), GATEWAY_NAME));
    err.status = 400;
    throw err;
  }

  const amountCents = Math.round(Number(order.total) * 100);
  if (amountCents < 1) {
    const err = toError(normalizeError(new Error("Order total must be greater than zero."), GATEWAY_NAME));
    err.status = 400;
    throw err;
  }

  const email = options.email != null ? options.email : order.email;
  const paymentMethodId = options.paymentMethodId ? String(options.paymentMethodId).trim() : null;
  const idempotencyKey = options.idempotencyKey ? String(options.idempotencyKey).trim() : null;
  const useSavedCard = paymentMethodId && userId;

  const metadata = {
    orderId: String(order.id),
    userId: userId ? String(userId) : "",
    sessionId: sessionId ? String(sessionId) : "",
  };

  try {
    if (useSavedCard) {
      const customer = await getOrCreateStripeCustomer(userId, email);
      try {
        const pm = await withTimeout(stripe.paymentMethods.retrieve(paymentMethodId));
        const pmCustomerId = typeof pm.customer === "string" ? pm.customer : pm.customer?.id;
        const ourCustomerId = String(customer.id || "").trim();
        const theirCustomerId = pmCustomerId ? String(pmCustomerId).trim() : null;
        if (theirCustomerId && theirCustomerId !== ourCustomerId) {
          await withTimeout(stripe.paymentMethods.detach(paymentMethodId));
          await withTimeout(stripe.paymentMethods.attach(paymentMethodId, { customer: ourCustomerId }));
        } else if (!theirCustomerId) {
          await withTimeout(stripe.paymentMethods.attach(paymentMethodId, { customer: ourCustomerId }));
        }
      } catch (attachErr) {
        const norm = normalizeError(attachErr, GATEWAY_NAME);
        logPaymentOp({
          operation: "createPaymentIntentForOrder",
          userId,
          orderId,
          success: false,
          durationMs: Date.now() - start,
          errorCode: norm.code,
        });
        throw toError(norm);
      }

      const params = {
        amount: amountCents,
        currency: order.currency.toLowerCase(),
        customer: customer.id,
        payment_method: paymentMethodId,
        confirm: false,
        payment_method_types: ["card"],
        metadata,
        automatic_payment_methods: { enabled: false },
      };
      if (idempotencyKey) params.idempotency_key = idempotencyKey;

      const paymentIntent = await withTimeout(stripe.paymentIntents.create(params));
      await orderRepo.update(order.id, { stripePaymentIntentId: paymentIntent.id });
      await orderService.recordPaymentAttempt(
        order.id,
        Number(order.total),
        order.currency,
        GATEWAY_NAME,
        paymentIntent.id,
        { type: "payment_intent" }
      );
      logPaymentOp({
        operation: "createPaymentIntentForOrder",
        userId,
        orderId,
        success: true,
        durationMs: Date.now() - start,
      });
      return { success: true, clientSecret: paymentIntent.client_secret };
    }

    const params = {
      amount: amountCents,
      currency: order.currency.toLowerCase(),
      metadata,
      automatic_payment_methods: { enabled: true },
    };
    if (userId) {
      const customer = await getOrCreateStripeCustomer(userId, email);
      params.customer = customer.id;
      params.setup_future_usage = "off_session";
    } else if (email && typeof email === "string" && email.trim()) {
      params.receipt_email = email.trim();
    }
    if (idempotencyKey) params.idempotency_key = idempotencyKey;

    const paymentIntent = await withTimeout(stripe.paymentIntents.create(params));
    await orderRepo.update(order.id, { stripePaymentIntentId: paymentIntent.id });
    await orderService.recordPaymentAttempt(
      order.id,
      Number(order.total),
      order.currency,
      GATEWAY_NAME,
      paymentIntent.id,
      { type: "payment_intent" }
    );
    logPaymentOp({
      operation: "createPaymentIntentForOrder",
      userId,
      orderId,
      success: true,
      durationMs: Date.now() - start,
    });
    return { success: true, clientSecret: paymentIntent.client_secret };
  } catch (err) {
    const norm = normalizeError(err, GATEWAY_NAME);
    logPaymentOp({
      operation: "createPaymentIntentForOrder",
      userId,
      orderId,
      success: false,
      durationMs: Date.now() - start,
      errorCode: norm.code,
    });
    const e = toError(norm);
    e.status = norm.status || 500;
    throw e;
  }
}

function constructWebhookEvent(rawBody, signature) {
  if (!stripe) {
    const err = new Error("Stripe is not configured.");
    err.status = 500;
    throw err;
  }
  if (!config.stripe.webhookSecret) {
    const err = new Error("Webhook secret not configured.");
    err.status = 500;
    throw err;
  }
  return stripe.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
}

async function handleWebhook(event) {
  if (!stripe) {
    logger.error("Stripe webhook received but Stripe is not configured");
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const orderId = session.metadata?.orderId;
        if (!orderId) {
          logger.warn("Checkout session completed but no orderId in metadata", {
            sessionIdLast4: safeId(session.id),
          });
          return;
        }
        if (session.payment_status !== "paid") {
          logger.info("Checkout session completed but payment not paid", {
            sessionIdLast4: safeId(session.id),
            paymentStatus: session.payment_status,
          });
          return;
        }
        const paymentIntentId = session.payment_intent;
        if (paymentIntentId) {
          const order = await orderRepo.findById(orderId);
          if (order) {
            if (order.paymentStatus === "paid") return;
            const customerEmail =
              session.customer_email ||
              session.customer_details?.email ||
              (session.customer_details && session.customer_details.email);
            const updates = { stripePaymentIntentId: paymentIntentId };
            if (customerEmail && order.sessionId && !order.userId) {
              updates.email = customerEmail;
            }
            await orderRepo.update(orderId, updates);

            const transactions = await transactionRepo.findByOrder(orderId);
            const transaction = transactions.find((t) => t.gatewayReference === session.id);
            if (transaction) {
              await transactionRepo.update(transaction.id, {
                gatewayReference: paymentIntentId,
                status: "success",
              });
              await orderService.recordPaymentSuccess(transaction.id, order.userId);
            } else {
              await orderService.recordPaymentAttempt(
                orderId,
                Number(session.amount_total) / 100,
                session.currency.toUpperCase(),
                GATEWAY_NAME,
                paymentIntentId,
                { sessionId: session.id, type: "checkout_session" }
              );
              const newTransactions = await transactionRepo.findByOrder(orderId);
              const newTransaction = newTransactions.find((t) => t.gatewayReference === paymentIntentId);
              if (newTransaction) {
                await orderService.recordPaymentSuccess(newTransaction.id, order.userId);
              }
            }

            if (customerEmail && order.sessionId && !order.userId) {
              const existingUser = await userRepo.findByEmail(customerEmail.trim().toLowerCase());
              if (existingUser) {
                await orderService.claimGuestOrdersByEmail(customerEmail, existingUser.id);
              }
            }
          }
        }
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;
        const orders = await orderRepo.findAll({
          where: { stripePaymentIntentId: paymentIntent.id },
        });
        if (orders.length > 0) {
          const order = orders[0];
          if (order.paymentStatus === "paid") break;
          const transactions = await transactionRepo.findByOrder(order.id);
          const transaction = transactions.find((t) => t.gatewayReference === paymentIntent.id);
          if (transaction && transaction.status === "pending") {
            await transactionRepo.update(transaction.id, { status: "success" });
            await orderService.recordPaymentSuccess(transaction.id, order.userId);
          }
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object;
        const orders = await orderRepo.findAll({
          where: { stripePaymentIntentId: paymentIntent.id },
        });
        if (orders.length > 0) {
          const order = orders[0];
          const transactions = await transactionRepo.findByOrder(order.id);
          const transaction = transactions.find((t) => t.gatewayReference === paymentIntent.id);
          if (transaction) {
            await orderService.recordPaymentFailed(transaction.id);
          }
          if (order.paymentStatus !== PAYMENT_STATUS.PAID) {
            await orderRepo.update(order.id, { paymentStatus: PAYMENT_STATUS.FAILED });
          }
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object;
        const paymentIntentId = charge.payment_intent;
        if (paymentIntentId) {
          const orders = await orderRepo.findAll({
            where: { stripePaymentIntentId: paymentIntentId },
          });
          if (orders.length > 0) {
            const order = orders[0];
            const transactions = await transactionRepo.findByOrder(order.id);
            const transaction = transactions.find(
              (t) => t.gatewayReference === paymentIntentId && t.status === "success"
            );
            if (transaction) {
              const refundAmount = charge.amount_refunded; // Stripe: cents
              const originalAmountCents = Math.round(Number(transaction.amount) * 100); // our DB: major units
              const isPartialRefund = refundAmount < originalAmountCents;
              await transactionRepo.update(transaction.id, {
                status: isPartialRefund ? "partially_refunded" : "refunded",
              });
              if (!isPartialRefund) {
                await orderService.restoreVariantQuantitiesForOrder(order.id);
              }
            }
          }
        }
        break;
      }

      default:
        logger.info("Unhandled Stripe webhook event", { eventType: event.type });
    }
  } catch (err) {
    logger.error("Error handling Stripe webhook", { error: err.message, eventType: event.type });
    throw err;
  }
}

async function createRefund(paymentIntentId, amount = null) {
  if (!stripe) {
    const err = toError(normalizeError(new Error("Stripe is not configured."), GATEWAY_NAME));
    err.status = 500;
    throw err;
  }
  const refundParams = { payment_intent: paymentIntentId };
  if (amount) {
    refundParams.amount = Math.round(amount * 100);
  }
  return await withTimeout(stripe.refunds.create(refundParams));
}

module.exports = {
  name: () => GATEWAY_NAME,
  isConfigured: () => stripe !== null,
  createPaymentIntentForCart,
  createSetupIntent,
  createCheckoutSession,
  savePaymentMethod,
  detachPaymentMethod,
  validatePaymentIntent,
  getPaymentMethodDetails,
  createPaymentIntentForOrder,
  constructWebhookEvent,
  handleWebhook,
  createRefund,
};
