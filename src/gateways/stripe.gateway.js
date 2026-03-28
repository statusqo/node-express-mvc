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
 * When userId is null (guest checkout), creates a fresh ephemeral customer with just the email — no caching.
 */
async function getOrCreateStripeCustomer(userId, email) {
  // Guest checkout: no userId — create an ephemeral customer with the provided email.
  // The customer ID is recorded on the Stripe Charge so e-racuni can read it via the Charge object.
  if (!userId) {
    const guestEmail = email && typeof email === "string" && email.trim() ? email.trim() : undefined;
    const customer = await withTimeout(
      stripe.customers.create({
        email: guestEmail,
        metadata: { userId: "" },
      })
    );
    logger.info("Stripe guest customer created", {
      emailDomain: guestEmail ? guestEmail.split("@")[1] : "(none)",
    });
    return customer;
  }

  const user = await userRepo.findById(userId);
  if (!user) {
    throw toError(normalizeError(new Error("User not found."), GATEWAY_NAME));
  }

  const preferredEmail = email || user.email;

  if (user.stripeCustomerId) {
    try {
      const customer = await withTimeout(stripe.customers.retrieve(user.stripeCustomerId));
      if (preferredEmail && !customer.email) {
        await withTimeout(stripe.customers.update(customer.id, { email: preferredEmail }));
      }
      return customer;
    } catch (err) {
      logger.warn("Stripe customer not found, creating new one", {
        stripeCustomerIdLast4: safeId(user.stripeCustomerId),
        userId,
      });
    }
  }

  const customer = await withTimeout(stripe.customers.create({
    email: preferredEmail,
    metadata: { userId: String(userId) },
  }));

  await userRepo.update(userId, { stripeCustomerId: customer.id });

  return customer;
}

/**
 * Enrich an existing Stripe Customer with order billing data so e-racuni can
 * read the buyer's identity and address from the Charge object reliably.
 *
 * Sets:
 *   - name  — company name (B2B) or full name (B2C)
 *   - address — billing address from the order
 *   - tax_ids — adds hr_oib for B2B if not already present
 *
 * name + address update will throw on failure (critical for Stripe invoice generation).
 * tax_id creation logs a warning on failure but does not abort the checkout.
 *
 * @param {string} customerId
 * @param {Object} order - Sequelize Order instance or plain object
 */
async function syncStripeCustomerWithOrder(customerId, order) {
  if (!stripe) return;

  // Build display name: company for B2B, full name for B2C
  const name =
    order.personType === "legal" && order.companyName
      ? order.companyName.trim()
      : [order.forename, order.surname].filter(Boolean).join(" ").trim() || null;

  const updateParams = {};
  if (name) updateParams.name = name;

  // Billing address — only populate if line1 is present (required field for a valid address)
  if (order.billingLine1) {
    updateParams.address = {
      line1: order.billingLine1,
      ...(order.billingLine2 && { line2: order.billingLine2 }),
      ...(order.billingCity && { city: order.billingCity }),
      ...(order.billingPostcode && { postal_code: order.billingPostcode }),
      ...(order.billingCountry && { country: order.billingCountry }),
    };
  }

  if (Object.keys(updateParams).length > 0) {
    await withTimeout(stripe.customers.update(customerId, updateParams));
  }

  // OIB tax ID for B2B (Croatian hr_oib) — required for e-racuni.hr e-invoicing.
  // Ensure exactly one hr_oib on the customer matching the current order's OIB.
  // Removes stale entries (e.g. company changed OIB) before adding the correct one.
  if (order.personType === "legal" && order.companyOib) {
    try {
      const correctOib = String(order.companyOib);
      const taxIds = await withTimeout(stripe.customers.listTaxIds(customerId, { limit: 10 }));
      const existing = (taxIds.data || []).filter((t) => t.type === "hr_oib");

      for (const taxId of existing) {
        if (taxId.value !== correctOib) {
          await withTimeout(stripe.customers.deleteTaxId(customerId, taxId.id));
        }
      }

      const alreadyCorrect = existing.some((t) => t.value === correctOib);
      if (!alreadyCorrect) {
        await withTimeout(
          stripe.customers.createTaxId(customerId, {
            type: "hr_oib",
            value: correctOib,
          })
        );
        logger.info("Stripe: hr_oib tax ID set on customer", { customerId });
      }
    } catch (taxErr) {
      logger.warn("Stripe: failed to update hr_oib tax ID on customer", {
        customerId,
        error: taxErr.message,
      });
    }
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
    if (existing.some((p) => p.stripePaymentMethodId === id)) {
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
      await paymentMethodService.update(sameCard.id, userId, { stripePaymentMethodId: id });
      logPaymentOp({ operation: "savePaymentMethod", userId, success: true, durationMs: Date.now() - start });
      return { saved: false };
    }

    await paymentMethodService.create(userId, {
      type: "card",
      stripePaymentMethodId: id,
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

async function createInvoiceForOrder(orderId, userId, sessionId, options = {}) {
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

  const email = options.email != null ? options.email : order.email;
  const paymentMethodId = options.paymentMethodId ? String(options.paymentMethodId).trim() : null;
  const idempotencyKey = options.idempotencyKey ? String(options.idempotencyKey).trim() : null;
  const saveCard = Boolean(options.saveCard) && Boolean(userId);
  const useSavedCard = Boolean(paymentMethodId) && Boolean(userId);

  const lines = await orderRepo.getLines(order.id);
  if (!lines || lines.length === 0) {
    const err = toError(normalizeError(new Error("Order has no items."), GATEWAY_NAME));
    err.status = 400;
    throw err;
  }

  try {
    const customer = await getOrCreateStripeCustomer(userId, email);
    await syncStripeCustomerWithOrder(customer.id, order);

    // Ensure saved payment method is attached to this customer before use.
    if (useSavedCard) {
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
          operation: "createInvoiceForOrder",
          userId,
          orderId,
          success: false,
          durationMs: Date.now() - start,
          errorCode: norm.code,
        });
        throw toError(norm);
      }
    }

    // Create draft invoice first so InvoiceItems attach directly to it (no orphan risk).
    const invoiceParams = {
      customer: customer.id,
      currency: order.currency.toLowerCase(),
      auto_advance: false,
      description: `Order #${order.id}`,
      metadata: {
        orderId: String(order.id),
        userId: userId ? String(userId) : "",
        sessionId: sessionId ? String(sessionId) : "",
      },
    };
    if (useSavedCard) {
      invoiceParams.default_payment_method = paymentMethodId;
    }
    const invoice = await withTimeout(
      idempotencyKey
        ? stripe.invoices.create(invoiceParams, { idempotencyKey: `inv_${idempotencyKey}` })
        : stripe.invoices.create(invoiceParams)
    );
    const invoiceId = invoice.id;

    // Create one InvoiceItem per order line, attached directly to the draft invoice.
    // metadata.sku is the primary key e-racuni uses for product matching.
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const itemMeta = {};
      if (line.sku) itemMeta.sku = String(line.sku);

      const itemParams = {
        customer: customer.id,
        invoice: invoiceId,
        unit_amount: Math.round(Number(line.price) * 100),
        quantity: line.quantity || 1,
        currency: order.currency.toLowerCase(),
        description: line.title || "Item",
        metadata: itemMeta,
      };
      if (line.stripeTaxRateId) {
        itemParams.tax_rates = [line.stripeTaxRateId];
      }
      await withTimeout(
        idempotencyKey
          ? stripe.invoiceItems.create(itemParams, { idempotencyKey: `${idempotencyKey}_item_${i}` })
          : stripe.invoiceItems.create(itemParams)
      );
    }

    // Finalize: transitions draft → open. Stripe marks zero-amount invoices paid immediately.
    await withTimeout(stripe.invoices.finalizeInvoice(invoiceId, { auto_advance: false }));

    // Retrieve the finalized invoice with expanded payment_intent to get client_secret.
    const finalized = await withTimeout(
      stripe.invoices.retrieve(invoiceId, { expand: ["payment_intent"] })
    );

    // Zero-amount invoices: Stripe marks them paid instantly with no PaymentIntent.
    // Record the transaction using the invoice ID as reference and signal alreadyPaid.
    if (finalized.status === "paid" && !finalized.payment_intent) {
      const tx = await orderService.recordPaymentAttempt(
        order.id,
        0,
        order.currency,
        GATEWAY_NAME,
        invoiceId,
        { type: "invoice", invoiceId }
      );
      await orderService.recordPaymentSuccess(tx.id, order.userId);
      logPaymentOp({
        operation: "createInvoiceForOrder",
        userId,
        orderId,
        success: true,
        durationMs: Date.now() - start,
      });
      return { success: true, clientSecret: null, alreadyPaid: true };
    }

    const paymentIntentObj = finalized.payment_intent;
    const paymentIntentId =
      typeof paymentIntentObj === "string" ? paymentIntentObj : paymentIntentObj?.id;

    if (!paymentIntentId) {
      throw new Error("Invoice finalization did not produce a PaymentIntent.");
    }

    // Stamp ownership metadata on the PaymentIntent so validatePaymentIntent keeps working.
    // Also set setup_future_usage for new-card flows (not needed when reusing a saved card).
    const piUpdateParams = {
      metadata: {
        orderId: String(order.id),
        userId: userId ? String(userId) : "",
        sessionId: sessionId ? String(sessionId) : "",
      },
    };
    if (saveCard && !useSavedCard) {
      piUpdateParams.setup_future_usage = "off_session";
    }
    await withTimeout(stripe.paymentIntents.update(paymentIntentId, piUpdateParams));

    const clientSecret =
      typeof paymentIntentObj === "string"
        ? (await withTimeout(stripe.paymentIntents.retrieve(paymentIntentId))).client_secret
        : paymentIntentObj.client_secret;

    await orderRepo.update(order.id, { stripePaymentIntentId: paymentIntentId });
    await orderService.recordPaymentAttempt(
      order.id,
      Number(order.total),
      order.currency,
      GATEWAY_NAME,
      paymentIntentId,
      { type: "invoice", invoiceId }
    );

    logPaymentOp({
      operation: "createInvoiceForOrder",
      userId,
      orderId,
      success: true,
      durationMs: Date.now() - start,
    });
    return { success: true, clientSecret };
  } catch (err) {
    const norm = normalizeError(err, GATEWAY_NAME);
    logPaymentOp({
      operation: "createInvoiceForOrder",
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

  // Atomic idempotency claim: insert the event record first.
  // If the insert succeeds, this instance owns the event and may process it.
  // If it fails with a unique constraint, the event was already handled — skip it.
  // If processing later fails, the claim is deleted so Stripe can retry correctly.
  const { ProcessedStripeEvent } = require("../models");
  try {
    await ProcessedStripeEvent.create({ eventId: event.id, createdAt: new Date() });
    logger.info("Stripe webhook: event claimed for processing", { eventId: event.id, eventType: event.type });
  } catch (claimErr) {
    if (claimErr.name === "SequelizeUniqueConstraintError") {
      logger.info("Stripe webhook: event already processed, skipping", {
        eventId: event.id,
        eventType: event.type,
      });
      return;
    }
    logger.error("Stripe webhook: failed to claim event record", {
      eventId: event.id,
      eventType: event.type,
      error: claimErr.message,
    });
    throw claimErr;
  }

  try {
    switch (event.type) {
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
              await transactionRepo.update(transaction.id, { status: "refunded" });
              await orderService.restoreVariantQuantitiesForOrder(order.id);
            }
          }
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object;
        const orderId = invoice.metadata?.orderId;
        if (!orderId) {
          logger.warn("invoice.paid: no orderId in invoice metadata", {
            invoiceIdLast4: safeId(invoice.id),
          });
          break;
        }
        // Zero-amount invoices have no PaymentIntent; use invoice.id as the reference.
        const paymentIntentId =
          typeof invoice.payment_intent === "string"
            ? invoice.payment_intent
            : invoice.payment_intent?.id ?? null;
        const gatewayRef = paymentIntentId || invoice.id;

        const invoiceOrder = await orderRepo.findById(orderId);
        if (!invoiceOrder) {
          logger.warn("invoice.paid: order not found", { orderId });
          break;
        }
        if (invoiceOrder.paymentStatus === PAYMENT_STATUS.PAID) break;

        const invoiceTransactions = await transactionRepo.findByOrder(orderId);
        const invoiceTx = invoiceTransactions.find((t) => t.gatewayReference === gatewayRef);

        if (invoiceTx) {
          if (invoiceTx.status === "pending") {
            await transactionRepo.update(invoiceTx.id, { status: "success" });
          }
          await orderService.recordPaymentSuccess(invoiceTx.id, invoiceOrder.userId);
        } else {
          // Fallback: create the transaction record if not already present.
          await orderService.recordPaymentAttempt(
            orderId,
            Number(invoice.amount_paid) / 100,
            (invoice.currency || invoiceOrder.currency).toUpperCase(),
            GATEWAY_NAME,
            gatewayRef,
            { type: "invoice", invoiceId: invoice.id }
          );
          const freshTxs = await transactionRepo.findByOrder(orderId);
          const newTx = freshTxs.find((t) => t.gatewayReference === gatewayRef);
          if (newTx) {
            await orderService.recordPaymentSuccess(newTx.id, invoiceOrder.userId);
          }
        }
        break;
      }

      default:
        logger.info("Unhandled Stripe webhook event", { eventType: event.type });
    }

    logger.info("Stripe webhook: event processed successfully", { eventId: event.id, eventType: event.type });
  } catch (err) {
    // Processing failed: delete the claim so Stripe retries this event correctly.
    logger.error("Stripe webhook: processing failed, releasing claim for retry", {
      eventId: event.id,
      eventType: event.type,
      error: err.message,
    });
    await ProcessedStripeEvent.destroy({ where: { eventId: event.id } }).catch((destroyErr) => {
      logger.error("Stripe webhook: could not release event claim — event may not retry correctly", {
        eventId: event.id,
        error: destroyErr.message,
      });
    });
    throw err;
  }
}

async function createRefund(paymentIntentId) {
  if (!stripe) {
    const err = toError(normalizeError(new Error("Stripe is not configured."), GATEWAY_NAME));
    err.status = 500;
    throw err;
  }
  return await withTimeout(stripe.refunds.create({ payment_intent: paymentIntentId }));
}

module.exports = {
  name: () => GATEWAY_NAME,
  isConfigured: () => stripe !== null,
  createSetupIntent,
  savePaymentMethod,
  detachPaymentMethod,
  validatePaymentIntent,
  getPaymentMethodDetails,
  createInvoiceForOrder,
  constructWebhookEvent,
  handleWebhook,
  createRefund,
};
