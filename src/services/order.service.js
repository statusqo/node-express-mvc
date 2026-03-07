const { sequelize } = require("../db");
const logger = require("../config/logger");
const orderRepo = require("../repos/order.repo");
const cartRepo = require("../repos/cart.repo");
const productVariantRepo = require("../repos/productVariant.repo");
const userRepo = require("../repos/user.repo");
const transactionRepo = require("../repos/transaction.repo");
const { PAYMENT_STATUS, FULFILLMENT_STATUS, FULFILLMENT_STATUSES, TRANSACTION_STATUS } = require("../constants");
const { Registration, Event, EventMeeting } = require("../models");
const { getMeetingProvider } = require("../gateways/meeting.interface");
const emailService = require("./email.service");
const invoiceService = require("./invoice.service");
// stripeGateway is required lazily to avoid circular dependency with stripe.gateway

const DEFAULT_CURRENCY = "USD";

/**
 * Get cart total for payment (same pricing as createOrderFromCart). Uses ProductPrice from variants.
 */
async function getCartTotalForPayment(userId, sessionId) {
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
    const priceRow = variant.ProductPrices?.[0];
    const price = priceRow ? Number(priceRow.amount) || 0 : 0;
    const qty = line.quantity || 1;
    total += price * qty;
  }

  return { total, currency: DEFAULT_CURRENCY };
}

/**
 * Create order from cart: create Order, OrderLines from cart lines (ProductVariant snapshot).
 * @param {string|null} userId
 * @param {string|null} sessionId
 * @param {Object} opts - Address fields, paymentStatus (default: pending), clearCart (default: true)
 * @returns {Promise<Order>}
 */
async function createOrderFromCart(userId, sessionId, opts = {}) {
  const {
    forename,
    surname,
    email,
    mobile,
    deliveryLine1,
    deliveryLine2,
    deliveryCity,
    deliveryState,
    deliveryPostcode,
    deliveryCountry,
    billingLine1,
    billingLine2,
    billingCity,
    billingState,
    billingPostcode,
    billingCountry,
  } = opts;

  // Guests are always private persons regardless of what opts says
  const personType = userId ? (opts.personType === 'legal' ? 'legal' : 'private') : 'private';
  const companyName = personType === 'legal' ? (opts.companyName || null) : null;
  const companyOib = personType === 'legal' ? (opts.companyOib || null) : null;

  const paymentStatus = opts.paymentStatus != null ? opts.paymentStatus : PAYMENT_STATUS.PENDING;
  const clearCart = opts.clearCart !== false;

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

  let orderPayload = {
    userId: userId || null,
    sessionId: sessionId || null,
    paymentStatus,
    fulfillmentStatus: FULFILLMENT_STATUS.PENDING,
    personType,
    companyName,
    companyOib,
    forename: forename || null,
    surname: surname || null,
    email: email || null,
    mobile: mobile || null,
    deliveryLine1: deliveryLine1 || null,
    deliveryLine2: deliveryLine2 || null,
    deliveryCity: deliveryCity || null,
    deliveryState: deliveryState || null,
    deliveryPostcode: deliveryPostcode || null,
    deliveryCountry: deliveryCountry || null,
    billingLine1: billingLine1 || null,
    billingLine2: billingLine2 || null,
    billingCity: billingCity || null,
    billingState: billingState || null,
    billingPostcode: billingPostcode || null,
    billingCountry: billingCountry || null,
    total: 0,
    currency: DEFAULT_CURRENCY,
  };

  if (userId) {
    const user = await userRepo.findById(userId);
    orderPayload = {
      ...orderPayload,
      forename: forename || user?.username || user?.email?.split("@")[0] || null,
      email: email || user?.email || null,
    };
  }

  const t = await sequelize.transaction();
  try {
    const order = await orderRepo.create(orderPayload, { transaction: t });

    let total = 0;
    for (const line of lines) {
      const snapshot = await productVariantRepo.getOrderLineSnapshot(line.productVariantId, { transaction: t });
      if (!snapshot) {
        throw new Error(`Product variant ${line.productVariantId} not found.`);
      }
      const qty = line.quantity || 1;
      total += snapshot.price * qty;
      await orderRepo.createLineFromVariant(order.id, snapshot, qty, { transaction: t });
    }

    await order.update({ total }, { transaction: t });
    if (clearCart) {
      await cartRepo.clearLines(cart.id, { transaction: t });
    }
    await t.commit();
    return order;
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

async function recordPaymentAttempt(orderId, amount, currency, gateway, gatewayReference, metadata = null) {
  const order = await orderRepo.findById(orderId);
  if (!order) {
    const err = new Error("Order not found.");
    err.status = 404;
    throw err;
  }
  return await transactionRepo.create({
    orderId,
    amount,
    currency: currency || order.currency,
    status: TRANSACTION_STATUS.PENDING,
    gateway,
    gatewayReference,
    metadata: metadata ? JSON.stringify(metadata) : null,
  });
}

/**
 * Mark transaction as success and order as paid.
 */
async function recordPaymentSuccess(transactionId, userIdFromOrder = null) {
  const transaction = await transactionRepo.findById(transactionId);
  if (!transaction) {
    const err = new Error("Transaction not found.");
    err.status = 404;
    throw err;
  }

  const order = await orderRepo.findById(transaction.orderId);
  if (!order) {
    const err = new Error("Order not found.");
    err.status = 404;
    throw err;
  }
  if (order.paymentStatus === PAYMENT_STATUS.PAID) {
    return order;
  }

  const t = await sequelize.transaction();
  try {
    await transactionRepo.update(transactionId, { status: TRANSACTION_STATUS.SUCCESS }, { transaction: t });
    const orderInTx = await orderRepo.findById(transaction.orderId, { transaction: t });
    await orderInTx.update({ paymentStatus: PAYMENT_STATUS.PAID }, { transaction: t });
    await t.commit();

    const orderAfter = await orderRepo.findById(transaction.orderId);
    const lines = await orderRepo.getLines(orderAfter.id);
    const { ProductVariant } = require("../models");
    for (const line of lines || []) {
      if (!line.productVariantId || !(line.quantity > 0)) continue;
      const variant = await ProductVariant.findByPk(line.productVariantId);
      if (variant) {
        await variant.decrement("quantity", { by: line.quantity });
        await variant.reload();
        if (variant.quantity < 0) {
          await variant.update({ quantity: 0 });
        }
      }
    }

    const cart = orderAfter.userId
      ? await cartRepo.findByUser(orderAfter.userId)
      : await cartRepo.findBySessionId(orderAfter.sessionId);
    if (cart) await cartRepo.clearLines(cart.id);

    // Create registrations for event order lines (one per eventId + orderLineId)
    const provider = getMeetingProvider();
    for (const line of lines || []) {
      if (!line.eventId) continue;
      const [reg] = await Registration.findOrCreate({
        where: { eventId: line.eventId, orderLineId: line.id },
        defaults: {
          eventId: line.eventId,
          orderId: orderAfter.id,
          orderLineId: line.id,
          userId: orderAfter.userId || null,
          email: orderAfter.email || "",
          forename: orderAfter.forename || null,
          surname: orderAfter.surname || null,
          status: "registered",
        },
      });
      if (provider && reg) {
        const event = await Event.findByPk(line.eventId, { include: [{ model: EventMeeting, as: "EventMeeting" }] });
        const meeting = event && event.EventMeeting ? event.EventMeeting.get({ plain: true }) : null;
        if (event && event.isOnline && meeting) {
          try {
            const regPlain = reg.get ? reg.get({ plain: true }) : reg;
            const { providerRegistrantId } = await provider.addRegistrant(meeting, regPlain);
            if (providerRegistrantId) await reg.update({ providerRegistrantId });
          } catch (_) {
            // Do not fail order flow
          }
        }
      }
    }

    // Generate invoice (receipt or R1) — failure must not abort the payment flow.
    // If invoice generation fails, the order remains PAID. Use the admin
    // /orders/:id/regenerate-invoice endpoint to recover missing invoices.
    let invoicePdfBuffer = null;
    let invoiceNumber = null;
    try {
      const invoiceTx = await sequelize.transaction();
      try {
        const orderPlain = orderAfter.get ? orderAfter.get({ plain: true }) : orderAfter;
        const linesPlain = (lines || []).map((l) => ({ title: l.title, quantity: l.quantity, price: l.price }));
        const { invoice, pdfBuffer } = await invoiceService.createInvoiceForOrder(orderPlain, linesPlain, invoiceTx);
        await invoiceTx.commit();
        invoicePdfBuffer = pdfBuffer;
        invoiceNumber = invoice.invoiceNumber;
      } catch (invoiceErr) {
        await invoiceTx.rollback();
        if (invoiceErr.name === "SequelizeUniqueConstraintError") {
          // A concurrent payment confirmation (e.g. webhook + frontend race) already
          // generated the invoice for this order. This is benign — no action needed.
          logger.info("Invoice already generated by a concurrent request — skipping duplicate", {
            orderId: orderAfter.id,
          });
        } else {
          logger.error("Invoice generation failed (payment still succeeded) — use admin regenerate-invoice to recover", {
            tag: "invoice_missing",
            orderId: orderAfter.id,
            error: invoiceErr.message,
          });
        }
      }
    } catch (_) {
      // sequelize.transaction() itself failed — ignore
    }

    if (emailService.sendOrderConfirmationEmail && emailService.isMailConfigured && emailService.isMailConfigured()) {
      try {
        const orderPlain = orderAfter.get ? orderAfter.get({ plain: true }) : orderAfter;
        const linesPlain = (lines || []).map((l) => ({ title: l.title, quantity: l.quantity, price: l.price }));
        await emailService.sendOrderConfirmationEmail(orderPlain, linesPlain, invoicePdfBuffer, invoiceNumber);
      } catch (_) {
        // Do not fail order flow on email failure
      }
    }

    const allNonPhysical =
      lines.length > 0 &&
      lines.every(
        (line) =>
          line.ProductVariant &&
          line.ProductVariant.Product &&
          line.ProductVariant.Product.isPhysical === false
      );
    if (allNonPhysical) {
      await orderRepo.update(orderAfter.id, { fulfillmentStatus: FULFILLMENT_STATUS.DELIVERED });
      return await orderRepo.findById(orderAfter.id);
    }
    return orderAfter;
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

/**
 * Fulfill a zero-total (free) order without any payment gateway interaction.
 * Marks the order as paid and runs all the same downstream actions as recordPaymentSuccess:
 * variant quantity decrements, cart clearing, event registrations, confirmation email,
 * and auto-fulfillment for non-physical products.
 * @param {string} orderId
 * @returns {Promise<Order>}
 */
async function fulfillFreeOrder(orderId) {
  const order = await orderRepo.findById(orderId);
  if (!order) {
    const e = new Error("Order not found.");
    e.status = 404;
    throw e;
  }
  if (Number(order.total) !== 0) {
    const e = new Error("Order is not free.");
    e.status = 400;
    throw e;
  }
  if (order.paymentStatus === PAYMENT_STATUS.PAID) return order;

  const t = await sequelize.transaction();
  try {
    const orderInTx = await orderRepo.findById(orderId, { transaction: t });
    await orderInTx.update({ paymentStatus: PAYMENT_STATUS.PAID }, { transaction: t });
    await t.commit();

    const orderAfter = await orderRepo.findById(orderId);
    const lines = await orderRepo.getLines(orderAfter.id);
    const { ProductVariant } = require("../models");

    for (const line of lines || []) {
      if (!line.productVariantId || !(line.quantity > 0)) continue;
      const variant = await ProductVariant.findByPk(line.productVariantId);
      if (variant) {
        await variant.decrement("quantity", { by: line.quantity });
        await variant.reload();
        if (variant.quantity < 0) await variant.update({ quantity: 0 });
      }
    }

    const cart = orderAfter.userId
      ? await cartRepo.findByUser(orderAfter.userId)
      : await cartRepo.findBySessionId(orderAfter.sessionId);
    if (cart) await cartRepo.clearLines(cart.id);

    const provider = getMeetingProvider();
    for (const line of lines || []) {
      if (!line.eventId) continue;
      const [reg] = await Registration.findOrCreate({
        where: { eventId: line.eventId, orderLineId: line.id },
        defaults: {
          eventId: line.eventId,
          orderId: orderAfter.id,
          orderLineId: line.id,
          userId: orderAfter.userId || null,
          email: orderAfter.email || "",
          forename: orderAfter.forename || null,
          surname: orderAfter.surname || null,
          status: "registered",
        },
      });
      if (provider && reg) {
        const event = await Event.findByPk(line.eventId, { include: [{ model: EventMeeting, as: "EventMeeting" }] });
        const meeting = event && event.EventMeeting ? event.EventMeeting.get({ plain: true }) : null;
        if (event && event.isOnline && meeting) {
          try {
            const regPlain = reg.get ? reg.get({ plain: true }) : reg;
            const { providerRegistrantId } = await provider.addRegistrant(meeting, regPlain);
            if (providerRegistrantId) await reg.update({ providerRegistrantId });
          } catch (_) {}
        }
      }
    }

    // Generate invoice for free order — same recovery path applies if this fails.
    let invoicePdfBuffer = null;
    let invoiceNumber = null;
    try {
      const invoiceTx = await sequelize.transaction();
      try {
        const orderPlain = orderAfter.get ? orderAfter.get({ plain: true }) : orderAfter;
        const linesPlain = (lines || []).map((l) => ({ title: l.title, quantity: l.quantity, price: l.price }));
        const { invoice, pdfBuffer } = await invoiceService.createInvoiceForOrder(orderPlain, linesPlain, invoiceTx);
        await invoiceTx.commit();
        invoicePdfBuffer = pdfBuffer;
        invoiceNumber = invoice.invoiceNumber;
      } catch (invoiceErr) {
        await invoiceTx.rollback();
        if (invoiceErr.name === "SequelizeUniqueConstraintError") {
          logger.info("Invoice already generated by a concurrent request — skipping duplicate", {
            orderId: orderAfter.id,
          });
        } else {
          logger.error("Invoice generation failed for free order — use admin regenerate-invoice to recover", {
            tag: "invoice_missing",
            orderId: orderAfter.id,
            error: invoiceErr.message,
          });
        }
      }
    } catch (_) {}

    if (emailService.sendOrderConfirmationEmail && emailService.isMailConfigured && emailService.isMailConfigured()) {
      try {
        const orderPlain = orderAfter.get ? orderAfter.get({ plain: true }) : orderAfter;
        const linesPlain = (lines || []).map((l) => ({ title: l.title, quantity: l.quantity, price: l.price }));
        await emailService.sendOrderConfirmationEmail(orderPlain, linesPlain, invoicePdfBuffer, invoiceNumber);
      } catch (_) {}
    }

    const allNonPhysical =
      lines.length > 0 &&
      lines.every(
        (line) =>
          line.ProductVariant &&
          line.ProductVariant.Product &&
          line.ProductVariant.Product.isPhysical === false
      );
    if (allNonPhysical) {
      await orderRepo.update(orderAfter.id, { fulfillmentStatus: FULFILLMENT_STATUS.DELIVERED });
      return await orderRepo.findById(orderAfter.id);
    }
    return orderAfter;
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

async function recordPaymentFailed(transactionId) {
  const transaction = await transactionRepo.findById(transactionId);
  if (!transaction) return null;
  return await transactionRepo.update(transactionId, { status: TRANSACTION_STATUS.FAILED });
}

/**
 * Restore product variant quantities when an order is refunded (increment by each order line's quantity).
 * Call from payment gateway webhook when a full refund is recorded.
 */
async function restoreVariantQuantitiesForOrder(orderId) {
  const order = await orderRepo.findById(orderId);
  if (!order) return;
  const lines = await orderRepo.getLines(order.id);
  const { ProductVariant } = require("../models");
  for (const line of lines || []) {
    if (!line.productVariantId || !(line.quantity > 0)) continue;
    const variant = await ProductVariant.findByPk(line.productVariantId);
    if (variant) {
      await variant.increment("quantity", { by: line.quantity });
    }
  }
}

/**
 * Full refund for an order (e.g. when admin cancels an event). Updates order, transaction, restores variant quantities.
 * Caller must ensure the order is eligible (e.g. paid order for cancelled event).
 * @param {string} orderId
 * @returns {Promise<{ refunded: boolean, error?: string }>}
 */
async function refundOrderForEventCancellation(orderId) {
  const order = await orderRepo.findById(orderId);
  if (!order) return { refunded: false, error: "Order not found." };
  if (order.paymentStatus !== PAYMENT_STATUS.PAID) {
    // Unpaid orders never decremented variant quantity, so nothing to restore.
    return { refunded: false, error: "Order is not paid." };
  }

  // Always restore seats for any paid order — the event is cancelled regardless of Stripe outcome.
  await restoreVariantQuantitiesForOrder(order.id);

  const paymentIntentId = order.stripePaymentIntentId;
  if (!paymentIntentId) {
    // Paid without Stripe (cash, manual, legacy) — mark refunded so admin knows, no Stripe call needed.
    await orderRepo.update(order.id, { paymentStatus: "refunded", fulfillmentStatus: "refunded" });
    return { refunded: true };
  }

  try {
    // require stripe gateway here to break circular dependency
    const stripeGateway = require("../gateways/stripe.gateway");
    await stripeGateway.createRefund(paymentIntentId, null);
  } catch (e) {
    // Stripe refund failed — seats are already freed but the financial refund is pending.
    // Admin must process the refund manually via Stripe dashboard.
    return { refunded: false, error: e.message || "Stripe refund failed." };
  }
  const transactions = await transactionRepo.findByOrder(order.id);
  const successTx = transactions.find((t) => t.gatewayReference === paymentIntentId && t.status === TRANSACTION_STATUS.SUCCESS);
  if (successTx) {
    await transactionRepo.update(successTx.id, { status: TRANSACTION_STATUS.REFUNDED });
  }
  await orderRepo.update(order.id, { paymentStatus: "refunded", fulfillmentStatus: "refunded" });
  return { refunded: true };
}

async function getOrderById(orderId, userId, sessionId) {
  const order = await orderRepo.findById(orderId);
  if (!order) return null;
  if (order.userId) {
    return userId && order.userId === userId ? order : null;
  }
  return sessionId && order.sessionId === sessionId ? order : null;
}

/**
 * Link a Stripe PaymentIntent to an order (e.g. after payment-first flow creates the order).
 */
async function linkPaymentIntentToOrder(orderId, paymentIntentId) {
  const order = await orderRepo.findById(orderId);
  if (!order) {
    const err = new Error("Order not found.");
    err.status = 404;
    throw err;
  }
  await orderRepo.update(orderId, { stripePaymentIntentId: paymentIntentId });
}

/**
 * Get order with its lines, enforcing ownership by userId/sessionId. Returns { order, lines } or throws if not found/unauthorized.
 */
async function getOrderWithLines(orderId, userId, sessionId) {
  const order = await getOrderById(orderId, userId, sessionId);
  if (!order) {
    const err = new Error("Order not found.");
    err.status = 404;
    throw err;
  }
  const lines = await orderRepo.getLines(order.id);
  return { order, lines };
}

/**
 * Create order from a single event (live session); one line = event's variant.
 * @param {string} eventId - Event id
 * @param {string|null} userId
 * @param {string|null} sessionId
 * @param {Object} opts - { forename, surname, email, billingLine1, billingLine2, billingCity, billingState, billingPostcode, billingCountry }
 * @returns {Promise<Order>}
 */
async function createOrderFromEvent(eventId, userId, sessionId, opts = {}) {
  const eventRepo = require("../repos/event.repo");

  const event = await eventRepo.findById(eventId);
  if (!event || !event.productVariantId) {
    const err = new Error("Event or variant not found.");
    err.status = 404;
    throw err;
  }

  const snapshot = await productVariantRepo.getOrderLineSnapshot(event.productVariantId);
  if (!snapshot) {
    const err = new Error("Product variant not found.");
    err.status = 404;
    throw err;
  }

  const total = Number(snapshot.price) || 0;
  const currency = snapshot.currency || DEFAULT_CURRENCY;

  // Guests are always private persons regardless of what opts says
  const personType = userId ? (opts.personType === 'legal' ? 'legal' : 'private') : 'private';
  const companyName = personType === 'legal' ? (opts.companyName || null) : null;
  const companyOib = personType === 'legal' ? (opts.companyOib || null) : null;

  let orderPayload = {
    userId: userId || null,
    sessionId: sessionId || null,
    paymentStatus: PAYMENT_STATUS.PENDING,
    fulfillmentStatus: FULFILLMENT_STATUS.PENDING,
    personType,
    companyName,
    companyOib,
    forename: opts.forename || null,
    surname: opts.surname || null,
    email: opts.email || null,
    mobile: null,
    deliveryLine1: null,
    deliveryLine2: null,
    deliveryCity: null,
    deliveryState: null,
    deliveryPostcode: null,
    deliveryCountry: null,
    billingLine1: opts.billingLine1 || null,
    billingLine2: opts.billingLine2 || null,
    billingCity: opts.billingCity || null,
    billingState: opts.billingState || null,
    billingPostcode: opts.billingPostcode || null,
    billingCountry: opts.billingCountry || null,
    total,
    currency,
  };

  if (userId) {
    const user = await userRepo.findById(userId);
    orderPayload = {
      ...orderPayload,
      forename: opts.forename || user?.username || user?.email?.split("@")[0] || null,
      email: opts.email || user?.email || null,
    };
  }

  const t = await sequelize.transaction();
  try {
    const order = await orderRepo.create(orderPayload, { transaction: t });
    await orderRepo.createLineFromVariant(order.id, snapshot, 1, { transaction: t, eventId });
    await t.commit();
    return order;
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

async function listOrders(userId, sessionId) {
  if (userId) return await orderRepo.findByUser(userId);
  if (sessionId) return await orderRepo.findBySessionId(sessionId);
  return [];
}

/**
 * List all orders for a user (admin view): by userId and by email (guest orders).
 */
async function listOrdersForUser(userId, email) {
  return await orderRepo.findByUserOrEmail(userId, email);
}

/**
 * Get order by id for admin (no ownership check).
 * @param {string} orderId
 * @returns {Promise<Order|null>}
 */
async function getOrderByIdForAdmin(orderId) {
  return await orderRepo.findById(orderId);
}

/**
 * List all orders for admin with optional filters.
 * @param {Object} filters - { paymentStatus?: string, fulfillmentStatus?: string, dateFrom?: string, dateTo?: string }
 * @returns {Promise<Order[]>}
 */
async function listOrdersForAdmin(filters = {}) {
  const sanitized = {};
  if (filters.paymentStatus && typeof filters.paymentStatus === "string") {
    sanitized.paymentStatus = filters.paymentStatus.trim();
  }
  if (filters.fulfillmentStatus && typeof filters.fulfillmentStatus === "string") {
    sanitized.fulfillmentStatus = filters.fulfillmentStatus.trim();
  }
  if (filters.dateFrom && typeof filters.dateFrom === "string") {
    sanitized.dateFrom = filters.dateFrom.trim() || null;
  }
  if (filters.dateTo && typeof filters.dateTo === "string") {
    sanitized.dateTo = filters.dateTo.trim() || null;
  }
  return await orderRepo.findAllWithFilters(sanitized);
}

/**
 * Update order for admin (e.g. fulfillmentStatus). Validates fields against constants.
 * @param {string} orderId
 * @param {Object} updates - { fulfillmentStatus?: string }
 * @returns {Promise<Order>}
 */
async function updateOrderForAdmin(orderId, updates = {}) {
  if (!orderId) {
    const err = new Error("Order not found.");
    err.status = 404;
    throw err;
  }

  const data = {};

  if (updates.fulfillmentStatus != null) {
    const s = String(updates.fulfillmentStatus).trim().toLowerCase();
    if (!FULFILLMENT_STATUSES.includes(s)) {
      const err = new Error("Invalid fulfillment status.");
      err.status = 400;
      throw err;
    }
    data.fulfillmentStatus = s;
  }

  if (Object.keys(data).length === 0) return await orderRepo.findById(orderId);

  const order = await orderRepo.update(orderId, data);
  if (!order) {
    const err = new Error("Order not found.");
    err.status = 404;
    throw err;
  }
  return order;
}

/**
 * Claim paid guest orders by email: set userId. Call after user registers or when Stripe webhook provides guest email that matches a user.
 */
async function claimGuestOrdersByEmail(email, userId) {
  if (!email || !userId) return [];
  const normalized = String(email).trim().toLowerCase();
  if (!normalized) return [];

  const allGuestOrders = await orderRepo.findAll({
    where: { userId: null, paymentStatus: PAYMENT_STATUS.PAID },
  });
  const orders = allGuestOrders.filter(
    (o) => o.email && String(o.email).trim().toLowerCase() === normalized
  );

  const claimed = [];
  for (const order of orders) {
    await orderRepo.update(order.id, { userId, sessionId: null });
    claimed.push(order);
  }
  return claimed;
}

module.exports = {
  getCartTotalForPayment,
  createOrderFromCart,
  createOrderFromEvent,
  recordPaymentAttempt,
  recordPaymentSuccess,
  fulfillFreeOrder,
  recordPaymentFailed,
  restoreVariantQuantitiesForOrder,
  refundOrderForEventCancellation,
  getOrderById,
  getOrderWithLines,
  linkPaymentIntentToOrder,
  listOrders,
  listOrdersForUser,
  getOrderByIdForAdmin,
  listOrdersForAdmin,
  updateOrderForAdmin,
  claimGuestOrdersByEmail,
};
