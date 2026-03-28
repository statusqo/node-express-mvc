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

    // VAT breakdown for display: group gross totals by rate, derive net and VAT amounts
    const vatMap = {};
    for (const line of lines) {
      const variant = line.ProductVariant || {};
      const product = variant.Product || {};
      const priceRow = variant.ProductPrices && variant.ProductPrices[0];
      const price = line.price != null ? Number(line.price) : (priceRow ? Number(priceRow.amount) : 0);
      const qty = line.quantity || 1;
      const gross = price * qty;
      const rate = product.TaxRate?.percentage != null ? Number(product.TaxRate.percentage) : 25;
      vatMap[rate] = (vatMap[rate] || 0) + gross;
    }
    const vatSummary = Object.entries(vatMap)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([rate, gross]) => {
        const r = Number(rate);
        const net = gross / (1 + r / 100);
        return { rate: r, net: net, vatAmount: gross - net, gross };
      });

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
      vatSummary,
    });
  },

  /**
   * Order-first flow: create order (pending), create Stripe Invoice for payment, return clientSecret.
   * Cart is not cleared until payment succeeds. Body: form data + optional paymentMethodId, email.
   * Returns JSON { clientSecret, orderId }.
   */
  async placeOrderAndCreateInvoice(req, res) {
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

    let order = null;
    try {
      const { cart, lines } = await cartService.getCartWithLines(userId, sessionId);
      if (!lines || lines.length === 0) {
        return res.status(400).json({ error: "Your cart is empty." });
      }

      order = await orderService.createOrderFromCart(userId, sessionId, opts);

      const gateway = getDefaultGateway();
      if (!gateway) {
        return res.status(503).json({ error: "Payment system is not configured." });
      }

      const email = (req.user && req.user.email) || (req.body && req.body.email && String(req.body.email).trim()) || null;
      const paymentMethodId = req.body && req.body.paymentMethodId ? String(req.body.paymentMethodId).trim() : null;
      const saveCardRaw = req.body && req.body.saveCard;
      const saveCard =
        saveCardRaw === "1" ||
        saveCardRaw === true ||
        saveCardRaw === "on" ||
        saveCardRaw === "true" ||
        (Array.isArray(saveCardRaw) && (saveCardRaw.includes("1") || saveCardRaw.includes(true)));
      const gatewayOptions = { email, saveCard };
      if (paymentMethodId && userId) {
        const list = await paymentMethodService.listByUser(userId);
        const owned = list.find((p) => p.stripePaymentMethodId === paymentMethodId);
        if (owned) {
          gatewayOptions.paymentMethodId = paymentMethodId;
        }
      }

      const result = await gateway.createInvoiceForOrder(order.id, userId, sessionId, gatewayOptions);
      if (!result || !result.success) {
        return res.status(500).json({ error: "Could not create payment." });
      }
      if (result.alreadyPaid) {
        return res.json({ free: true, orderId: order.id });
      }
      return res.json({ clientSecret: result.clientSecret, orderId: order.id });
    } catch (err) {
      if (order) {
        await orderService.cancelOrder(order.id).catch((cancelErr) => {
          logger.error("Checkout: failed to cancel order after Stripe failure", {
            orderId: order.id,
            error: cancelErr.message,
          });
        });
      }
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

};
