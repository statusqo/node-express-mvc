const orderService = require("../../services/order.service");
const cartService = require("../../services/cart.service");
const addressService = require("../../services/address.service");
const { getDefaultGateway } = require("../../gateways");
const paymentMethodService = require("../../services/paymentMethod.service");
const transactionRepo = require("../../repos/transaction.repo");
const { validateCheckout } = require("../../validators/checkout.schema");
const logger = require("../../config/logger");

function getUserIdAndSession(req) {
  const userId = req.user ? req.user.id : null;
  const sessionId = req.session && req.sessionID ? req.sessionID : null;
  return { userId, sessionId };
}

/** Cart has any physical product → require delivery & billing address. */
function cartRequiresAddress(lines) {
  if (!lines || lines.length === 0) return false;
  return lines.some((line) => {
    const product = line.ProductVariant?.Product;
    return product && product.isPhysical !== false;
  });
}

module.exports = {
  async show(req, res) {
    const { userId, sessionId } = getUserIdAndSession(req);
    const { cart, lines } = await cartService.getCartWithLines(userId, sessionId);
    if (!lines || lines.length === 0) {
      res.setFlash("error", "Your cart is empty.");
      return res.redirect("/cart");
    }
    const { total: checkoutTotal, currency: checkoutCurrency } = await orderService.getCartTotalForPayment(userId, sessionId);
    let deliveryAddress = null;
    let billingAddress = null;
    let sameAsDelivery = false;
    if (userId) {
      deliveryAddress = await addressService.getDeliveryAddress(userId);
      billingAddress = await addressService.getBillingAddress(userId);
      sameAsDelivery = !billingAddress || (deliveryAddress && billingAddress.id === deliveryAddress.id);
    }
    res.locals.hideCartDrawer = true;
    const userPlain = req.user && typeof req.user.get === "function" ? req.user.get({ plain: true }) : req.user || null;
    const config = require("../../config");
    let paymentMethods = [];
    if (userId) {
      try {
        paymentMethods = await paymentMethodService.listByUser(userId);
      } catch (e) {
        paymentMethods = [];
      }
    }
    const requiresAddress = cartRequiresAddress(lines);
    res.render("web/checkout", {
      title: "Checkout",
      cart,
      lines,
      checkoutTotal,
      checkoutCurrency,
      deliveryAddress,
      billingAddress,
      sameAsDelivery,
      requiresAddress,
      user: userPlain,
      paymentMethods,
      stripePublishableKey: config.stripe?.publishableKey || "",
    });
  },

  async placeOrder(req, res) {
    const { userId, sessionId } = getUserIdAndSession(req);
    const parsed = validateCheckout(req.body);
    if (!parsed.ok) {
      res.setFlash("error", "Invalid checkout data.");
      return res.redirect("/checkout");
    }
    const opts = {
      forename: parsed.data.forename || null,
      surname: parsed.data.surname || null,
      email: parsed.data.email || null,
      mobile: parsed.data.mobile || null,
      deliveryLine1: parsed.data.deliveryLine1 || null,
      deliveryLine2: parsed.data.deliveryLine2 || null,
      deliveryCity: parsed.data.deliveryCity || null,
      deliveryState: parsed.data.deliveryState || null,
      deliveryPostcode: parsed.data.deliveryPostcode || null,
      deliveryCountry: parsed.data.deliveryCountry || null,
      billingLine1: parsed.data.billingLine1 || null,
      billingLine2: parsed.data.billingLine2 || null,
      billingCity: parsed.data.billingCity || null,
      billingState: parsed.data.billingState || null,
      billingPostcode: parsed.data.billingPostcode || null,
      billingCountry: parsed.data.billingCountry || null,
      personType: req.user?.personType || 'private',
      companyName: req.user?.companyName || null,
      companyOib: req.user?.companyOib || null,
    };
    try {
      const order = await orderService.createOrderFromCart(userId, sessionId, {
        ...opts,
        clearCart: false,
      });

      if (Number(order.total) === 0) {
        await orderService.fulfillFreeOrder(order.id);
        res.setFlash("success", "You're registered! Your order is confirmed.");
        return res.redirect("/orders/" + order.id);
      }

      // Post-Redirect-Get: redirect same-origin so the browser always leaves /checkout.
      // GET /orders/:id?pay=1 will then 302 to Stripe Checkout (standard payment flow).
      res.setFlash("success", "Order created. Redirecting to payment…");
      return res.redirect(302, "/orders/" + order.id + "?pay=1");
    } catch (err) {
      const message =
        err.status === 404 ? "Cart not found." : err.status === 400 ? "Your cart is empty." : "Could not place order.";
      res.setFlash("error", message);
      return res.redirect(302, "/checkout");
    }
  },

  /**
   * Order-first flow: create order (pending), create PaymentIntent for that order, return clientSecret.
   * Cart is not cleared until payment succeeds. Body: form data + optional paymentMethodId, email.
   * Returns JSON { clientSecret, orderId }.
   */
  async placeOrderAndCreatePaymentIntent(req, res) {
    const { userId, sessionId } = getUserIdAndSession(req);
    const parsed = validateCheckout(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ error: "Invalid checkout data." });
    }

    const opts = {
      forename: parsed.data.forename || null,
      surname: parsed.data.surname || null,
      email: parsed.data.email || null,
      mobile: parsed.data.mobile || null,
      deliveryLine1: parsed.data.deliveryLine1 || null,
      deliveryLine2: parsed.data.deliveryLine2 || null,
      deliveryCity: parsed.data.deliveryCity || null,
      deliveryState: parsed.data.deliveryState || null,
      deliveryPostcode: parsed.data.deliveryPostcode || null,
      deliveryCountry: parsed.data.deliveryCountry || null,
      billingLine1: parsed.data.billingLine1 || null,
      billingLine2: parsed.data.billingLine2 || null,
      billingCity: parsed.data.billingCity || null,
      billingState: parsed.data.billingState || null,
      billingPostcode: parsed.data.billingPostcode || null,
      billingCountry: parsed.data.billingCountry || null,
      personType: req.user?.personType || 'private',
      companyName: req.user?.companyName || null,
      companyOib: req.user?.companyOib || null,
      clearCart: false,
    };

    try {
      const { cart, lines } = await cartService.getCartWithLines(userId, sessionId);
      if (!lines || lines.length === 0) {
        return res.status(400).json({ error: "Your cart is empty." });
      }

      const order = await orderService.createOrderFromCart(userId, sessionId, opts);

      if (Number(order.total) === 0) {
        await orderService.fulfillFreeOrder(order.id);
        return res.json({ free: true, orderId: order.id });
      }

      const gateway = getDefaultGateway();
      if (!gateway) {
        return res.status(503).json({ error: "Payment system is not configured." });
      }

      const email = (req.user && req.user.email) || (req.body && req.body.email && String(req.body.email).trim()) || null;
      const paymentMethodId = req.body && req.body.paymentMethodId ? String(req.body.paymentMethodId).trim() : null;
      const gatewayOptions = { email };
      if (paymentMethodId && userId) {
        const list = await paymentMethodService.listByUser(userId);
        const owned = list.find((p) => p.gatewayToken === paymentMethodId);
        if (owned) {
          gatewayOptions.paymentMethodId = paymentMethodId;
        }
      }

      const result = await gateway.createPaymentIntentForOrder(order.id, userId, sessionId, gatewayOptions);
      if (!result || !result.clientSecret) {
        return res.status(500).json({ error: "Could not create payment." });
      }
      return res.json({ clientSecret: result.clientSecret, orderId: order.id });
    } catch (err) {
      const status = err.status ?? err.statusCode ?? 500;
      logger.error("Checkout place-order failed", {
        error: err.message,
        status,
        stack: err.stack,
      });
      const message =
        status === 404 ? "Cart not found." : status === 400 ? (err.message || "Your cart is empty.") : "Could not place order.";
      return res.status(status).json({ error: message });
    }
  },

  /**
   * After payment succeeded: validate PaymentIntent, mark order paid, clear cart. Order already exists.
   * Body: paymentIntentId, orderId, form data (for save card). Returns JSON { orderId }.
   */
  async confirmOrder(req, res) {
    const { userId, sessionId } = getUserIdAndSession(req);
    const paymentIntentId = (req.body && req.body.paymentIntentId) ? String(req.body.paymentIntentId).trim() : null;
    const orderId = (req.body && req.body.orderId) ? String(req.body.orderId).trim() : null;
    if (!paymentIntentId || !orderId) {
      return res.status(400).json({ error: "Missing paymentIntentId or orderId." });
    }

    try {
      const gateway = getDefaultGateway();
      if (!gateway) {
        return res.status(500).json({ error: "Payment system is not configured." });
      }
      const { paymentIntent } = await gateway.validatePaymentIntent(paymentIntentId, userId, sessionId);

      const order = await orderService.getOrderById(orderId, userId, sessionId);
      if (!order) {
        return res.status(404).json({ error: "Order not found." });
      }
      if (order.paymentStatus === "paid") {
        return res.json({ orderId: order.id });
      }

      const transactions = await transactionRepo.findByOrder(order.id);
      const transaction = transactions.find((t) => t.gatewayReference === paymentIntentId);
      if (!transaction) {
        return res.status(400).json({ error: "Transaction not found for this payment." });
      }

      await orderService.recordPaymentSuccess(transaction.id, order.userId);

      const saveCardRaw = req.body && req.body.saveCard;
      const saveCard =
        saveCardRaw === "1" ||
        saveCardRaw === true ||
        saveCardRaw === "on" ||
        saveCardRaw === "true" ||
        (Array.isArray(saveCardRaw) && (saveCardRaw.includes("1") || saveCardRaw.includes(true)));
      const bodyPm = req.body && req.body.paymentMethodId ? String(req.body.paymentMethodId).trim() : "";
      const pmFromIntent = paymentIntent.payment_method;
      const pmFromIntentId =
        typeof pmFromIntent === "string"
          ? (pmFromIntent || "").trim()
          : pmFromIntent && typeof pmFromIntent.id === "string"
            ? pmFromIntent.id.trim()
            : null;
      const paymentMethodIdToSave =
        bodyPm.startsWith("pm_") ? bodyPm : pmFromIntentId && pmFromIntentId.startsWith("pm_") ? pmFromIntentId : null;

      logger.info("Checkout confirm-order", {
        saveCard,
        userId: userId || "(guest)",
        paymentMethodIdToSave: paymentMethodIdToSave ? "pm_..." : "(none)",
      });

      if (userId && saveCard && paymentMethodIdToSave && paymentMethodIdToSave.startsWith("pm_") && gateway) {
        try {
          const result = await gateway.savePaymentMethod(userId, paymentMethodIdToSave);
          if (result.saved) {
            logger.info("Checkout: payment method saved for user", { userId, paymentMethodId: paymentMethodIdToSave });
          }
        } catch (saveErr) {
          logger.warn("Checkout: save card failed", {
            userId,
            paymentMethodId: paymentMethodIdToSave,
            error: saveErr.message,
          });
        }
      }

      return res.json({ orderId: order.id });
    } catch (err) {
      const status = err.status ?? err.statusCode ?? 500;
      logger.error("Checkout confirm-order failed", {
        error: err.message,
        status,
        stack: err.stack,
      });
      const message =
        status === 404 ? "Order not found." : status === 400 ? (err.message || "Invalid payment.") : "Could not confirm order.";
      const payload = { error: message };
      if (process.env.NODE_ENV !== "production" && err.message) {
        payload.detail = err.message;
      }
      return res.status(status).json(payload);
    }
  },

  /**
   * Create PaymentIntent for current cart (no order yet). Payment-first flow: charge first, then create order on success.
   * Body: optional paymentMethodId (saved card), optional email. Returns JSON { clientSecret } for Stripe.js confirmCardPayment.
   * @deprecated Use placeOrderAndCreatePaymentIntent for order-first flow.
   */
  async createPaymentIntent(req, res) {
    const { userId, sessionId } = getUserIdAndSession(req);
    try {
      const { cart, lines } = await cartService.getCartWithLines(userId, sessionId);
      if (!lines || lines.length === 0) {
        return res.status(400).json({ error: "Your cart is empty." });
      }
      const { total, currency } = await orderService.getCartTotalForPayment(userId, sessionId);
      const email = (req.user && req.user.email) || (req.body && req.body.email && String(req.body.email).trim()) || null;
      const paymentMethodId = req.body && req.body.paymentMethodId ? String(req.body.paymentMethodId).trim() : null;
      const options = { email };
      let useSavedCard = false;
      if (paymentMethodId && userId) {
        const list = await paymentMethodService.listByUser(userId);
        const owned = list.find((p) => p.gatewayToken === paymentMethodId);
        if (owned) {
          options.paymentMethodId = paymentMethodId;
          useSavedCard = true;
        }
      }
      const gateway = getDefaultGateway();
      if (!gateway) {
        return res.status(503).json({ error: "Payment system is not configured." });
      }
      const result = await gateway.createPaymentIntentForCart(total, currency, userId, sessionId, options);
      return res.json(useSavedCard ? { clientSecret: result.clientSecret, useSavedCard: true } : { clientSecret: result.clientSecret });
    } catch (err) {
      const status = err.status ?? err.statusCode ?? 500;
      logger.error("Checkout createPaymentIntent failed", {
        error: err.message,
        status,
        stack: err.stack,
      });
      const message =
        status === 404 ? "Cart not found." : status === 400 ? (err.message || "Your cart is empty.") : "Could not create payment.";
      return res.status(status).json({ error: message });
    }
  },

  /**
   * After payment succeeded: create order, link PaymentIntent, mark paid. Expects form data + paymentIntentId.
   * Returns JSON { orderId }. Redirect to /orders/:orderId is done by frontend.
   */
  async completeOrder(req, res) {
    const { userId, sessionId } = getUserIdAndSession(req);
    const paymentIntentId = (req.body && req.body.paymentIntentId) ? String(req.body.paymentIntentId).trim() : null;
    if (!paymentIntentId) {
      return res.status(400).json({ error: "Missing paymentIntentId." });
    }

    const parsed = validateCheckout(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ error: "Invalid checkout data." });
    }

    const opts = {
      forename: parsed.data.forename || null,
      surname: parsed.data.surname || null,
      email: parsed.data.email || null,
      mobile: parsed.data.mobile || null,
      deliveryLine1: parsed.data.deliveryLine1 || null,
      deliveryLine2: parsed.data.deliveryLine2 || null,
      deliveryCity: parsed.data.deliveryCity || null,
      deliveryState: parsed.data.deliveryState || null,
      deliveryPostcode: parsed.data.deliveryPostcode || null,
      deliveryCountry: parsed.data.deliveryCountry || null,
      billingLine1: parsed.data.billingLine1 || null,
      billingLine2: parsed.data.billingLine2 || null,
      billingCity: parsed.data.billingCity || null,
      billingState: parsed.data.billingState || null,
      billingPostcode: parsed.data.billingPostcode || null,
      billingCountry: parsed.data.billingCountry || null,
      personType: req.user?.personType || 'private',
      companyName: req.user?.companyName || null,
      companyOib: req.user?.companyOib || null,
    };

    try {
      const gateway = getDefaultGateway();
      if (!gateway) {
        return res.status(500).json({ error: "Payment system is not configured." });
      }
      const { paymentIntent } = await gateway.validatePaymentIntent(paymentIntentId, userId, sessionId);

      const order = await orderService.createOrderFromCart(userId, sessionId, opts);
      await orderService.linkPaymentIntentToOrder(order.id, paymentIntentId);

      const transaction = await orderService.recordPaymentAttempt(
        order.id,
        Number(order.total),
        order.currency,
        "stripe",
        paymentIntentId,
        { type: "payment_intent" }
      );
      await orderService.recordPaymentSuccess(transaction.id, order.userId);

      // Save card for later: only for registered users. Use client-sent paymentMethodId first (they got it from the same PaymentIntent after confirm); fallback to PaymentIntent.payment_method.
      const saveCardRaw = req.body && req.body.saveCard;
      const saveCard =
        saveCardRaw === "1" ||
        saveCardRaw === true ||
        saveCardRaw === "on" ||
        saveCardRaw === "true" ||
        (Array.isArray(saveCardRaw) && (saveCardRaw.includes("1") || saveCardRaw.includes(true)));
      const bodyPm = req.body && req.body.paymentMethodId ? String(req.body.paymentMethodId).trim() : "";
      const pmFromIntent = paymentIntent.payment_method;
      const pmFromIntentId =
        typeof pmFromIntent === "string"
          ? (pmFromIntent || "").trim()
          : pmFromIntent && typeof pmFromIntent.id === "string"
            ? pmFromIntent.id.trim()
            : null;
      const paymentMethodIdToSave =
        bodyPm.startsWith("pm_") ? bodyPm : pmFromIntentId && pmFromIntentId.startsWith("pm_") ? pmFromIntentId : null;

      logger.info("Checkout complete-order", {
        saveCard,
        userId: userId || "(guest)",
        paymentMethodIdToSave: paymentMethodIdToSave ? "pm_..." : "(none)",
      });

      if (userId && saveCard && paymentMethodIdToSave && paymentMethodIdToSave.startsWith("pm_") && gateway) {
        logger.info("Checkout: attempting to save card", { userId, paymentMethodId: paymentMethodIdToSave });
        try {
          const result = await gateway.savePaymentMethod(userId, paymentMethodIdToSave);
          if (result.saved) {
            logger.info("Checkout: payment method saved for user", { userId, paymentMethodId: paymentMethodIdToSave });
          } else {
            logger.info("Checkout: payment method already saved or duplicate", { userId, paymentMethodId: paymentMethodIdToSave });
          }
        } catch (saveErr) {
          logger.warn("Checkout: save card failed", {
            userId,
            paymentMethodId: paymentMethodIdToSave,
            error: saveErr.message,
            status: saveErr.status,
          });
        }
      } else if (saveCard && (!userId || !paymentMethodIdToSave || !paymentMethodIdToSave.startsWith("pm_"))) {
        logger.warn("Checkout: save card skipped", {
          userId: userId || "(none)",
          saveCard,
          bodyPaymentMethodId: bodyPm ? (bodyPm.startsWith("pm_") ? "(valid)" : bodyPm) : "(missing)",
          paymentMethodFromIntent: pmFromIntentId ? (String(pmFromIntentId).startsWith("pm_") ? "(valid)" : pmFromIntentId) : "(missing)",
        });
      }

      return res.json({ orderId: order.id });
    } catch (err) {
      const status = err.status ?? err.statusCode ?? 500;
      logger.error("Checkout complete-order failed", {
        error: err.message,
        status,
        stack: err.stack,
      });
      const message =
        status === 404 ? "Cart not found." : status === 400 ? (err.message || "Your cart is empty.") : "Could not complete order.";
      const payload = { error: message };
      if (process.env.NODE_ENV !== "production" && err.message) {
        payload.detail = err.message;
      }
      return res.status(status).json(payload);
    }
  },

  async payOrder(req, res) {
    const { userId, sessionId } = getUserIdAndSession(req);
    const orderId = req.params.id;
    
    try {
      const order = await orderService.getOrderById(orderId, userId, sessionId);
      if (!order) {
        res.setFlash("error", "Order not found.");
        return res.redirect("/orders");
      }

      if (order.paymentStatus !== "pending" && order.paymentStatus !== "failed") {
        res.setFlash("error", "This order cannot be paid.");
        return res.redirect("/orders/" + orderId);
      }

      const gateway = getDefaultGateway();
      if (!gateway) {
        res.setFlash("error", "Payment system is not configured.");
        return res.redirect("/orders/" + orderId);
      }
      const result = await gateway.createCheckoutSession(order.id, userId, sessionId);
      return res.redirect(result.url);
    } catch (err) {
      logger.error("Failed to create payment session", err);
      res.setFlash("error", err.message || "Failed to create payment session.");
      return res.redirect("/orders/" + orderId);
    }
  },
};
