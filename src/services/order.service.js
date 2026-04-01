const { sequelize } = require("../db");
const logger = require("../config/logger");
const orderRepo = require("../repos/order.repo");
const orderLineRepo = require("../repos/orderLine.repo");
const cartRepo = require("../repos/cart.repo");
const productVariantRepo = require("../repos/productVariant.repo");
const eventRepo = require("../repos/event.repo");
const orderAttendeeRepo = require("../repos/orderAttendee.repo");
const userRepo = require("../repos/user.repo");
const transactionRepo = require("../repos/transaction.repo");
const refundTransactionRepo = require("../repos/refundTransaction.repo");
const registrationRepo = require("../repos/registration.repo");
const eventMeetingRepo = require("../repos/eventMeeting.repo");
const { PAYMENT_STATUS, FULFILLMENT_STATUS, FULFILLMENT_STATUS_LIST, TRANSACTION_STATUS, REGISTRATION_STATUS, ORDER_SOURCE } = require("../constants");
const { REFUND_TRANSACTION_STATUS, REFUND_TRANSACTION_SCOPE } = require("../constants/refundTransaction");
const { getMeetingProvider } = require("../gateways/meeting.interface");
const emailService = require("./email.service");
const storeSettingService = require("./storeSetting.service");
// stripeGateway is required lazily to avoid circular dependency with stripe.gateway

const { DEFAULT_CURRENCY } = require("../config/constants");

function normalizePerson(value) {
  return value && String(value).trim() ? String(value).trim() : null;
}

function toAttendeeRowsForVariantEntry(entry) {
  if (!entry || !Array.isArray(entry.attendees)) return [];
  return entry.attendees
    .map((a) => ({
      email: a && a.email ? String(a.email).trim().toLowerCase() : "",
      forename: normalizePerson(a?.forename),
      surname: normalizePerson(a?.surname),
    }))
    .filter((a) => a.email);
}

function buildAttendeeMapFromOpts(opts = {}) {
  const map = new Map();
  const raw = Array.isArray(opts.attendees) ? opts.attendees : [];
  for (const entry of raw) {
    const productVariantId = entry && entry.productVariantId ? String(entry.productVariantId).trim() : "";
    if (!productVariantId) continue;
    map.set(productVariantId, toAttendeeRowsForVariantEntry(entry));
  }
  return map;
}

async function createOrderAttendeesForLine({ orderId, orderLineId, eventId, orderUserId, personType, quantity, fallbackContact, selectedAttendees, transaction }) {
  const qty = Number(quantity) || 1;
  const legalOrder = personType === "legal";
  const rows = [];
  if (legalOrder) {
    if (!Array.isArray(selectedAttendees) || selectedAttendees.length !== qty) {
      const err = new Error("Attendee details are required for each reserved event seat.");
      err.status = 400;
      throw err;
    }
    for (let i = 0; i < selectedAttendees.length; i++) {
      const attendee = selectedAttendees[i];
      if (!attendee || !attendee.email) {
        const err = new Error("Each attendee must include a valid email address.");
        err.status = 400;
        throw err;
      }
      rows.push({
        orderId,
        orderLineId,
        eventId,
        attendeeIndex: i + 1,
        email: attendee.email,
        forename: attendee.forename || null,
        surname: attendee.surname || null,
        userId: null,
      });
    }
  } else {
    if (!fallbackContact || !fallbackContact.email) {
      const err = new Error("Email is required for event registration.");
      err.status = 400;
      throw err;
    }
    rows.push({
      orderId,
      orderLineId,
      eventId,
      attendeeIndex: 1,
      email: fallbackContact.email,
      forename: fallbackContact.forename || null,
      surname: fallbackContact.surname || null,
      userId: orderUserId || null,
    });
  }
  await orderAttendeeRepo.bulkCreate(rows, { transaction });
}

async function createRegistrationsAndSyncZoomForOrder(orderAfter) {
  const lines = await orderRepo.getLines(orderAfter.id);
  const provider = getMeetingProvider();
  for (const line of lines || []) {
    if (!line.eventId) continue;
    const attendees = await orderAttendeeRepo.findAllByOrderLineId(line.id);
    for (const attendee of attendees || []) {
      const [reg, created] = await registrationRepo.findOrCreateByOrderAttendee(
        attendee.id,
        {
          eventId: line.eventId,
          orderId: orderAfter.id,
          orderLineId: line.id,
          orderAttendeeId: attendee.id,
          userId: attendee.userId || null,
          email: attendee.email || "",
          forename: attendee.forename || null,
          surname: attendee.surname || null,
          status: REGISTRATION_STATUS.REGISTERED,
        }
      );
      logger.info("recordRegistration: registration", {
        registrationId: reg.id,
        eventId: line.eventId,
        orderId: orderAfter.id,
        created,
      });
      if (provider && reg && !reg.zoomRegistrantId) {
        const event = await eventRepo.findById(line.eventId);
        const meeting = event && event.isOnline ? await eventMeetingRepo.findByEventId(line.eventId) : null;
        if (event && event.isOnline && meeting) {
          try {
            const regPlain = reg.get ? reg.get({ plain: true }) : reg;
            const meetingPlain = meeting.get ? meeting.get({ plain: true }) : meeting;
            const { zoomRegistrantId } = await provider.addRegistrant(meetingPlain, regPlain);
            if (zoomRegistrantId) {
              await registrationRepo.update(reg.id, { zoomRegistrantId });
            }
          } catch (zoomErr) {
            logger.warn("registrationZoomSync failed (non-fatal)", {
              registrationId: reg.id,
              eventId: line.eventId,
              error: zoomErr.message,
            });
          }
        }
      }
    }
  }
  return lines;
}

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
    source: ORDER_SOURCE.CART,
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

  const checkoutVatEnabled = await storeSettingService.isCheckoutVatEnabled();

  const t = await sequelize.transaction();
  try {
    const order = await orderRepo.create(orderPayload, { transaction: t });
    const attendeeMapByVariant = buildAttendeeMapFromOpts(opts);

    let total = 0;
    for (const line of lines) {
      const variant = await productVariantRepo.findById(line.productVariantId, { transaction: t });
      if (!variant || !variant.active) {
        throw new Error("One or more items in your cart are no longer available.");
      }
      if (variant.quantity != null && variant.quantity < 1) {
        throw new Error("One or more items in your cart are sold out.");
      }
      const snapshot = await productVariantRepo.getOrderLineSnapshot(line.productVariantId, {
        transaction: t,
        checkoutVatEnabled,
      });
      if (!snapshot) {
        throw new Error(`Product variant ${line.productVariantId} not found.`);
      }
      if (checkoutVatEnabled && (!snapshot.stripeTaxRateId || snapshot.vatRate == null)) {
        const err = new Error("One or more products are missing a tax rate. Please contact the store.");
        err.status = 400;
        throw err;
      }
      const eventForVariant = await eventRepo.findByProductVariantId(line.productVariantId, { transaction: t });
      const lineEventId = eventForVariant ? eventForVariant.id : undefined;
      const selectedAttendees = attendeeMapByVariant.get(String(line.productVariantId)) || [];
      const cartQty = Number(line.quantity) || 1;
      let orderLineQty = cartQty;
      if (lineEventId && personType === "legal") {
        orderLineQty = Array.isArray(selectedAttendees) ? selectedAttendees.length : 0;
        if (orderLineQty < 1) {
          const err = new Error("Add at least one attendee for each event in your order.");
          err.status = 400;
          throw err;
        }
        if (variant.quantity != null && Number(variant.quantity) < orderLineQty) {
          const err = new Error("Not enough seats remaining for one or more events.");
          err.status = 400;
          throw err;
        }
      }

      total += snapshot.price * orderLineQty;
      const orderLine = await orderRepo.createLineFromVariant(order.id, snapshot, orderLineQty, { transaction: t, eventId: lineEventId });
      if (lineEventId) {
        await createOrderAttendeesForLine({
          orderId: order.id,
          orderLineId: orderLine.id,
          eventId: lineEventId,
          orderUserId: order.userId,
          personType,
          quantity: orderLineQty,
          fallbackContact: {
            email: order.email ? String(order.email).trim().toLowerCase() : null,
            forename: order.forename || null,
            surname: order.surname || null,
          },
          selectedAttendees,
          transaction: t,
        });
      }
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

async function recordPaymentAttempt(orderId, amount, currency, gatewayReference, metadata = null) {
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

  // Block 1: commit the payment status change atomically.
  const t = await sequelize.transaction();
  try {
    await transactionRepo.update(transactionId, { status: TRANSACTION_STATUS.SUCCESS }, { transaction: t });
    const orderInTx = await orderRepo.findById(transaction.orderId, { transaction: t });
    await orderInTx.update({ paymentStatus: PAYMENT_STATUS.PAID }, { transaction: t });
    await t.commit();
    logger.info("recordPaymentSuccess: order marked paid", { orderId: transaction.orderId, transactionId });
  } catch (e) {
    await t.rollback();
    throw e;
  }

  // Block 2: post-commit fulfillment — runs outside the transaction so a failure here
  // cannot attempt to roll back an already-committed transaction.
  // Errors are logged and the caller receives a resolved order rather than a misleading error.
  try {
    const orderAfter = await orderRepo.findById(transaction.orderId);
    const lines = await orderRepo.getLines(orderAfter.id);
    for (const line of lines || []) {
      if (!line.productVariantId || !(line.quantity > 0)) continue;
      await productVariantRepo.decrementQuantityAndClamp(line.productVariantId, line.quantity);
    }

    if (orderAfter.source === ORDER_SOURCE.CART) {
      const cart = orderAfter.userId
        ? await cartRepo.findByUser(orderAfter.userId)
        : await cartRepo.findBySessionId(orderAfter.sessionId);
      if (cart) await cartRepo.clearLines(cart.id);
    }

    await createRegistrationsAndSyncZoomForOrder(orderAfter);

    if (emailService.sendOrderConfirmationEmail && emailService.isMailConfigured && emailService.isMailConfigured()) {
      try {
        const orderPlain = orderAfter.get ? orderAfter.get({ plain: true }) : orderAfter;
        const linesPlain = (lines || []).map((l) => ({ title: l.title, quantity: l.quantity, price: l.price, vatRate: l.vatRate != null ? Number(l.vatRate) : null }));
        await emailService.sendOrderConfirmationEmail(orderPlain, linesPlain);
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
  } catch (postErr) {
    logger.error("recordPaymentSuccess: post-commit fulfillment failed — order is paid but downstream state may be incomplete", {
      orderId: transaction.orderId,
      transactionId,
      error: postErr.message,
      stack: postErr.stack,
    });
    return await orderRepo.findById(transaction.orderId);
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

  // Block 1: commit the payment status change atomically.
  const t = await sequelize.transaction();
  try {
    const orderInTx = await orderRepo.findById(orderId, { transaction: t });
    await orderInTx.update({ paymentStatus: PAYMENT_STATUS.PAID }, { transaction: t });
    await transactionRepo.create({
      orderId,
      amount: 0,
      currency: order.currency,
      status: TRANSACTION_STATUS.SUCCESS,
      gatewayReference: null,
      metadata: null,
    }, { transaction: t });
    await t.commit();
  } catch (e) {
    await t.rollback();
    throw e;
  }

  // Block 2: post-commit fulfillment — runs outside the transaction so a failure here
  // cannot attempt to roll back an already-committed transaction.
  try {
    const orderAfter = await orderRepo.findById(orderId);
    const lines = await orderRepo.getLines(orderAfter.id);

    for (const line of lines || []) {
      if (!line.productVariantId || !(line.quantity > 0)) continue;
      await productVariantRepo.decrementQuantityAndClamp(line.productVariantId, line.quantity);
    }

    // Only clear the cart for cart-sourced orders. Event registrations must not wipe
    // unrelated items the customer may have in their cart.
    if (orderAfter.source === ORDER_SOURCE.CART) {
      const cart = orderAfter.userId
        ? await cartRepo.findByUser(orderAfter.userId)
        : await cartRepo.findBySessionId(orderAfter.sessionId);
      if (cart) await cartRepo.clearLines(cart.id);
    }

    await createRegistrationsAndSyncZoomForOrder(orderAfter);

    if (emailService.sendOrderConfirmationEmail && emailService.isMailConfigured && emailService.isMailConfigured()) {
      try {
        const orderPlain = orderAfter.get ? orderAfter.get({ plain: true }) : orderAfter;
        const linesPlain = (lines || []).map((l) => ({ title: l.title, quantity: l.quantity, price: l.price, vatRate: l.vatRate != null ? Number(l.vatRate) : null }));
        await emailService.sendOrderConfirmationEmail(orderPlain, linesPlain);
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
  } catch (postErr) {
    logger.error("fulfillFreeOrder: post-commit fulfillment failed — order is paid but downstream state may be incomplete", {
      orderId,
      error: postErr.message,
      stack: postErr.stack,
    });
    return await orderRepo.findById(orderId);
  }
}

async function cancelOrder(orderId) {
  await orderRepo.update(orderId, { paymentStatus: "failed" });
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
  for (const line of lines || []) {
    if (!line.productVariantId || !(line.quantity > 0)) continue;
    await productVariantRepo.incrementQuantity(line.productVariantId, line.quantity);
  }
}

function toMoneyNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const REFUND_ELIGIBLE_PAYMENT_STATUSES = [PAYMENT_STATUS.PAID, PAYMENT_STATUS.PARTIALLY_REFUNDED];

function parseRefundTxMetadata(refundTx) {
  if (!refundTx || !refundTx.metadata) return {};
  try {
    return typeof refundTx.metadata === "string" ? JSON.parse(refundTx.metadata) : refundTx.metadata;
  } catch (_) {
    return {};
  }
}

async function getSucceededRefundedTotal(orderId) {
  const rows = await refundTransactionRepo.findAllSucceededByOrderId(orderId);
  return rows.reduce((acc, row) => acc + toMoneyNumber(row.amount), 0);
}

/**
 * Remaining order total that can still be refunded via Stripe (major units).
 * @param {string} orderId
 * @returns {Promise<number|null>}
 */
async function getRemainingRefundableAmount(orderId) {
  const order = await orderRepo.findById(orderId);
  if (!order) return null;
  const refunded = await getSucceededRefundedTotal(orderId);
  return Math.max(0, toMoneyNumber(order.total) - refunded);
}

function isPaymentStatusRefundable(paymentStatus) {
  return REFUND_ELIGIBLE_PAYMENT_STATUSES.includes(paymentStatus);
}

/**
 * Restore variant stock for each remaining registration row (one increment per seat).
 * Used for full-order refunds after partial attendee refunds already restored some units.
 */
async function restoreVariantQuantitiesForRemainingRegistrations(orderId) {
  const registrations = await registrationRepo.findAllByOrderId(orderId);
  const counts = new Map();
  for (const reg of registrations || []) {
    const line = await orderLineRepo.findById(reg.orderLineId);
    if (line && line.productVariantId) {
      const pid = line.productVariantId;
      counts.set(pid, (counts.get(pid) || 0) + 1);
    }
  }
  for (const [productVariantId, n] of counts) {
    if (n > 0) await productVariantRepo.incrementQuantity(productVariantId, n);
  }
}

async function recomputeOrderPaymentStatusByRefunds(orderId) {
  const order = await orderRepo.findById(orderId);
  if (!order) return null;
  const refundedRows = await refundTransactionRepo.findAllSucceededByOrderId(orderId);
  const refundedTotal = refundedRows.reduce((acc, row) => acc + toMoneyNumber(row.amount), 0);
  const orderTotal = toMoneyNumber(order.total);
  const epsilon = 0.0001;

  let paymentStatus = PAYMENT_STATUS.PAID;
  if (refundedTotal > epsilon && refundedTotal + epsilon < orderTotal) {
    paymentStatus = PAYMENT_STATUS.PARTIALLY_REFUNDED;
  } else if (refundedTotal + epsilon >= orderTotal && orderTotal > 0) {
    paymentStatus = PAYMENT_STATUS.REFUNDED;
  } else if (orderTotal === 0 && refundedTotal > epsilon) {
    paymentStatus = PAYMENT_STATUS.REFUNDED;
  }

  const updates = { paymentStatus };
  if (paymentStatus === PAYMENT_STATUS.REFUNDED) {
    updates.fulfillmentStatus = FULFILLMENT_STATUS.REFUNDED;
  }
  await orderRepo.update(orderId, updates);
  return await orderRepo.findById(orderId);
}

async function applyRefundTransactionEffects(refundTxId) {
  const refundTx = await refundTransactionRepo.findById(refundTxId);
  if (!refundTx) return { applied: false, error: "Refund transaction not found." };
  if (refundTx.status !== REFUND_TRANSACTION_STATUS.SUCCEEDED) {
    return { applied: false, error: "Refund transaction not succeeded." };
  }
  if (refundTx.processedAt) return { applied: true };

  const meta = parseRefundTxMetadata(refundTx);
  const zoomRemovedBeforeRefund = meta.zoomRemovedBeforeRefund === true;

  if (refundTx.scopeType === REFUND_TRANSACTION_SCOPE.FULL_ORDER) {
    if (refundTx.paymentTransactionId) {
      await transactionRepo.update(refundTx.paymentTransactionId, { status: TRANSACTION_STATUS.REFUNDED });
    }
    await restoreVariantQuantitiesForRemainingRegistrations(refundTx.orderId);
    const registrations = await registrationRepo.findAllByOrderId(refundTx.orderId);
    const provider = getMeetingProvider();
    for (const reg of registrations || []) {
      if (!zoomRemovedBeforeRefund && provider && reg.zoomRegistrantId) {
        const meeting = await eventMeetingRepo.findByEventId(reg.eventId);
        if (meeting) {
          try {
            const meetingPlain = meeting.get ? meeting.get({ plain: true }) : meeting;
            await provider.removeRegistrant(meetingPlain, reg.zoomRegistrantId);
          } catch (_) {}
        }
      }
      await registrationRepo.destroy(reg.id);
    }
  } else if (refundTx.scopeType === REFUND_TRANSACTION_SCOPE.LINE_QUANTITY) {
    const line = refundTx.orderLineId ? await orderLineRepo.findById(refundTx.orderLineId) : null;
    if (line && line.productVariantId && refundTx.refundedQuantity > 0) {
      await productVariantRepo.incrementQuantity(line.productVariantId, Number(refundTx.refundedQuantity));
    }
  } else if (refundTx.scopeType === REFUND_TRANSACTION_SCOPE.EVENT_ATTENDEE) {
    const reg = refundTx.registrationId ? await registrationRepo.findById(refundTx.registrationId) : null;
    if (reg) {
      const line = await orderLineRepo.findById(reg.orderLineId);
      if (line && line.productVariantId) {
        await productVariantRepo.incrementQuantity(line.productVariantId, 1);
      }
      const provider = getMeetingProvider();
      if (!zoomRemovedBeforeRefund && provider && reg.zoomRegistrantId) {
        const meeting = await eventMeetingRepo.findByEventId(reg.eventId);
        if (meeting) {
          try {
            const meetingPlain = meeting.get ? meeting.get({ plain: true }) : meeting;
            await provider.removeRegistrant(meetingPlain, reg.zoomRegistrantId);
          } catch (_) {}
        }
      }
      await registrationRepo.destroy(reg.id);
    }
  }

  await refundTransactionRepo.update(refundTx.id, { processedAt: new Date() });
  await recomputeOrderPaymentStatusByRefunds(refundTx.orderId);
  return { applied: true };
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
  if (!isPaymentStatusRefundable(order.paymentStatus)) {
    return { refunded: false, error: "Order is not in a refundable payment state." };
  }

  const remaining = await getRemainingRefundableAmount(orderId);
  if (remaining === null || remaining <= 0) {
    return { refunded: false, error: "No refundable amount remaining." };
  }

  logger.info("refundOrderForEventCancellation: starting", { orderId, paymentStatus: order.paymentStatus, remaining });

  const paymentIntentId = order.stripePaymentIntentId;
  const transactions = await transactionRepo.findByOrder(order.id);
  const successTx = transactions.find((t) => t.gatewayReference === paymentIntentId && t.status === TRANSACTION_STATUS.SUCCESS);
  const refundTxBase = {
    orderId: order.id,
    paymentTransactionId: successTx ? successTx.id : null,
    paymentIntentId: paymentIntentId || null,
    amount: remaining,
    currency: order.currency,
    scopeType: REFUND_TRANSACTION_SCOPE.FULL_ORDER,
    refundedQuantity: null,
    reason: "Event cancellation refund",
  };

  if (!paymentIntentId) {
    const refundTx = await refundTransactionRepo.create({
      ...refundTxBase,
      status: REFUND_TRANSACTION_STATUS.SUCCEEDED,
      stripeRefundId: null,
    });
    await applyRefundTransactionEffects(refundTx.id);
    logger.info("refundOrderForEventCancellation: marked refunded (no Stripe PI)", { orderId });
    return { refunded: true };
  }

  try {
    // require stripe gateway here to break circular dependency
    const stripeGateway = require("../gateways/stripe.gateway");
    const idempotencyKey = `event_cancel_refund_${order.id}_${Math.round(remaining * 100)}`;
    const refund = await stripeGateway.createRefund({
      paymentIntentId,
      amountMinor: Math.round(remaining * 100),
      reason: "requested_by_customer",
      metadata: { orderId: String(order.id), scopeType: REFUND_TRANSACTION_SCOPE.FULL_ORDER },
      idempotencyKey,
    });
    let refundTx = await refundTransactionRepo.findByStripeRefundId(refund.id);
    const refundMeta = JSON.stringify({ stripeStatus: refund.status });
    if (!refundTx) {
      refundTx = await refundTransactionRepo.create({
        ...refundTxBase,
        stripeRefundId: refund.id,
        status: refund.status === "succeeded" ? REFUND_TRANSACTION_STATUS.SUCCEEDED : REFUND_TRANSACTION_STATUS.PENDING,
        metadata: refundMeta,
      });
    } else {
      await refundTransactionRepo.update(refundTx.id, {
        status: refund.status === "succeeded" ? REFUND_TRANSACTION_STATUS.SUCCEEDED : REFUND_TRANSACTION_STATUS.PENDING,
        metadata: refundMeta,
      });
    }
    if (refund.status === "succeeded") {
      await applyRefundTransactionEffects(refundTx.id);
    }
  } catch (e) {
    logger.error("refundOrderForEventCancellation: Stripe refund failed", { orderId, error: e.message });
    return { refunded: false, error: e.message || "Stripe refund failed." };
  }
  logger.info("refundOrderForEventCancellation: refund complete", { orderId });
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

  const checkoutVatEnabled = await storeSettingService.isCheckoutVatEnabled();

  // Guests are always private persons regardless of what opts says
  const personType = userId ? (opts.personType === 'legal' ? 'legal' : 'private') : 'private';
  const companyName = personType === 'legal' ? (opts.companyName || null) : null;
  const companyOib = personType === 'legal' ? (opts.companyOib || null) : null;

  const t = await sequelize.transaction();
  try {
    // Re-verify variant availability inside the transaction to guard against concurrent bookings
    // that could pass the controller-level check but then oversell the last seat.
    const variantInTx = await productVariantRepo.findById(event.productVariantId, { transaction: t });
    if (!variantInTx || !variantInTx.active) {
      const err = new Error("This session is no longer available.");
      err.status = 400;
      throw err;
    }
    if (variantInTx.quantity != null && variantInTx.quantity < 1) {
      const err = new Error("This session is sold out.");
      err.status = 400;
      throw err;
    }
    const snapshot = await productVariantRepo.getOrderLineSnapshot(event.productVariantId, {
      transaction: t,
      checkoutVatEnabled,
    });
    if (!snapshot) {
      const err = new Error("Product variant not found.");
      err.status = 404;
      throw err;
    }
    if (checkoutVatEnabled && (!snapshot.stripeTaxRateId || snapshot.vatRate == null)) {
      const err = new Error("This product is missing a tax rate. Please contact the store.");
      err.status = 400;
      throw err;
    }

    const total = Number(snapshot.price) || 0;
    const currency = snapshot.currency || DEFAULT_CURRENCY;

    let orderPayload = {
      userId: userId || null,
      sessionId: sessionId || null,
      paymentStatus: PAYMENT_STATUS.PENDING,
      fulfillmentStatus: FULFILLMENT_STATUS.PENDING,
      source: ORDER_SOURCE.EVENT,
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
      const user = await userRepo.findById(userId, { transaction: t });
      orderPayload = {
        ...orderPayload,
        forename: opts.forename || user?.username || user?.email?.split("@")[0] || null,
        email: opts.email || user?.email || null,
      };
    }

    const order = await orderRepo.create(orderPayload, { transaction: t });
    const orderLine = await orderRepo.createLineFromVariant(order.id, snapshot, 1, { transaction: t, eventId });
    await createOrderAttendeesForLine({
      orderId: order.id,
      orderLineId: orderLine.id,
      eventId,
      orderUserId: order.userId,
      personType,
      quantity: 1,
      fallbackContact: {
        email: order.email ? String(order.email).trim().toLowerCase() : null,
        forename: order.forename || null,
        surname: order.surname || null,
      },
      selectedAttendees: [{
        email: order.email ? String(order.email).trim().toLowerCase() : "",
        forename: order.forename || null,
        surname: order.surname || null,
      }],
      transaction: t,
    });
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
    if (!FULFILLMENT_STATUS_LIST.includes(s)) {
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

/**
 * Get all transactions for an order. Used by checkout controller to find the transaction
 * matching a PaymentIntent after payment confirmation.
 */
async function getTransactionsForOrder(orderId) {
  return await transactionRepo.findByOrder(orderId);
}

/**
 * Admin order edit: order header + line items + payment transactions (plain objects).
 * @param {string} orderId
 * @returns {Promise<{ order: object, orderLines: object[], transactions: object[] }|null>}
 */
async function getAdminOrderEditPayload(orderId) {
  if (!orderId) return null;
  const orderRow = await orderRepo.findById(orderId);
  if (!orderRow) return null;
  const lines = await orderRepo.getLines(orderId, {});
  const txs = await transactionRepo.findByOrder(orderId);
  return {
    order: orderRow.get ? orderRow.get({ plain: true }) : orderRow,
    orderLines: (lines || []).map((l) => (l.get ? l.get({ plain: true }) : l)),
    transactions: (txs || []).map((t) => (t.get ? t.get({ plain: true }) : t)),
  };
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
  getRemainingRefundableAmount,
  getSucceededRefundedTotal,
  isPaymentStatusRefundable,
  recomputeOrderPaymentStatusByRefunds,
  applyRefundTransactionEffects,
  refundOrderForEventCancellation,
  cancelOrder,
  getOrderById,
  getOrderWithLines,
  linkPaymentIntentToOrder,
  listOrders,
  listOrdersForUser,
  getOrderByIdForAdmin,
  listOrdersForAdmin,
  updateOrderForAdmin,
  claimGuestOrdersByEmail,
  getTransactionsForOrder,
  getAdminOrderEditPayload,
};
