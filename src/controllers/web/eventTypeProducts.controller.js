/**
 * Public controller for event-type product sections (Webinars, Classrooms).
 * Seminars use src/controllers/web/seminars.controller.js (catalog + inquiry only, no Zoom).
 * Expects req.categorySlug and req.sectionPath set by route middleware (e.g. categorySlug: 'webinar', sectionPath: 'webinars').
 */
const productService = require("../../services/product.service");
const eventService = require("../../services/event.service");
const orderService = require("../../services/order.service");
const paymentMethodService = require("../../services/paymentMethod.service");
const { validateEventRegister } = require("../../validators/eventRegister.schema");
const { getDefaultGateway } = require("../../gateways");
const config = require("../../config");
const { DEFAULT_CURRENCY } = require("../../config/constants");
const logger = require("../../config/logger");
const storeSettingService = require("../../services/storeSetting.service");

function toPlain(obj) {
  return obj && typeof obj.get === "function" ? obj.get({ plain: true }) : obj;
}

function getTypeLabel(sectionPath) {
  const labels = { webinars: "Webinars", classrooms: "Classrooms" };
  return labels[sectionPath] || sectionPath;
}

module.exports = {
  async index(req, res) {
    const categorySlug = req.categorySlug;
    const sectionPath = req.sectionPath;
    if (!categorySlug || !sectionPath) return res.redirect("/");
    const products = await productService.findAllByCategorySlug(categorySlug);
    const list = (products || []).map((p) => {
      const plain = toPlain(p);
      const variant = plain.ProductVariants && plain.ProductVariants[0];
      const priceRow = variant?.ProductPrices?.[0];
      return {
        ...plain,
        priceAmount: priceRow ? Number(priceRow.amount) : null,
        currency: DEFAULT_CURRENCY,
      };
    }).filter((p) => p.active);
    res.render("web/event-type-products/index", {
      title: getTypeLabel(sectionPath),
      products: list,
      sectionPath,
      typeLabel: getTypeLabel(sectionPath),
    });
  },

  async show(req, res) {
    const { slug } = req.params;
    const sectionPath = req.sectionPath;
    const product = await productService.findActiveBySlugWithTypeAndCategory(slug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect("/" + sectionPath);
    }
    const plain = toPlain(product);
    const productCategorySlug = plain.ProductCategory && plain.ProductCategory.slug;
    if (productCategorySlug !== req.categorySlug) {
      res.setFlash("error", "Product not found.");
      return res.redirect("/" + sectionPath);
    }
    const events = await eventService.findActiveByProductIdWithVariant(product.id);
    const eventsPlain = (events || []).map(toPlain);
    res.render("web/event-type-products/show", {
      title: plain.title,
      product: plain,
      events: eventsPlain,
      sectionPath,
      typeLabel: getTypeLabel(sectionPath),
    });
  },

  /**
   * GET /:slug/register?eventId= — Event checkout page; session is fixed by eventId (no session picker).
   */
  async registerForm(req, res) {
    const { slug } = req.params;
    const sectionPath = req.sectionPath;
    const eventId = req.query.eventId ? String(req.query.eventId).trim() : null;
    if (!eventId) {
      res.setFlash("error", "Please select a session.");
      return res.redirect("/" + sectionPath + "/" + slug);
    }
    const product = await productService.findActiveBySlugWithTypeAndCategory(slug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect("/" + sectionPath);
    }
    const plain = toPlain(product);
    if (plain.ProductCategory && plain.ProductCategory.slug !== req.categorySlug) {
      res.setFlash("error", "Product not found.");
      return res.redirect("/" + sectionPath);
    }
    const event = await eventService.findByIdWithVariant(eventId);
    if (!event || String(event.productId) !== String(product.id)) {
      res.setFlash("error", "Invalid session.");
      return res.redirect("/" + sectionPath + "/" + plain.slug);
    }
    if (event.eventStatus !== "active") {
      res.setFlash("error", "This session is no longer available.");
      return res.redirect("/" + sectionPath + "/" + plain.slug);
    }
    const eventPlain = toPlain(event);
    if (!eventPlain.productVariantId) {
      res.setFlash("error", "This session cannot be booked.");
      return res.redirect("/" + sectionPath + "/" + plain.slug);
    }
    const seatsRemaining = eventPlain.ProductVariant && eventPlain.ProductVariant.quantity != null
      ? Number(eventPlain.ProductVariant.quantity)
      : 0;
    if (seatsRemaining < 1) {
      res.setFlash("error", "This session is sold out.");
      return res.redirect("/" + sectionPath + "/" + plain.slug);
    }
    // Use the event's own variant price — this is what will actually be charged and is the
    // authoritative value for determining whether the session is free (priceAmount === 0).
    const eventPriceRow = await eventService.getPriceForEvent(eventPlain);
    const priceAmount = eventPriceRow ? Number(eventPriceRow.amount) : null;
    const currency = DEFAULT_CURRENCY;
    let paymentMethods = [];
    if (req.user && req.user.id) {
      try {
        paymentMethods = await paymentMethodService.listByUser(req.user.id);
      } catch (e) {
        paymentMethods = [];
      }
    }
    const userPlain = req.user && typeof req.user.get === "function" ? req.user.get({ plain: true }) : req.user || null;
    const checkoutVatEnabled = await storeSettingService.isCheckoutVatEnabled();
    res.render("web/event-type-products/register", {
      title: "Register: " + plain.title,
      product: plain,
      event: eventPlain,
      seatsRemaining,
      sectionPath,
      typeLabel: getTypeLabel(sectionPath),
      priceAmount,
      currency,
      stripePublishableKey: config.stripe?.publishableKey || "",
      user: userPlain,
      paymentMethods,
      checkoutVatEnabled,
    });
  },

  /**
   * POST /:slug/place-order — Create order from event + PaymentIntent; return { clientSecret, orderId } (no redirect).
   */
  async placeOrder(req, res) {
    const { slug } = req.params;
    const sectionPath = req.sectionPath;
    const product = await productService.findActiveBySlugWithTypeAndCategory(slug);
    if (!product) {
      return res.status(404).json({ error: "Product not found." });
    }
    const plain = toPlain(product);
    if (plain.ProductCategory && plain.ProductCategory.slug !== req.categorySlug) {
      return res.status(404).json({ error: "Product not found." });
    }
    const validation = validateEventRegister(req.body || {});
    if (!validation.ok) {
      const msg = (validation.errors && validation.errors[0] && validation.errors[0].message) || "Invalid input.";
      return res.status(400).json({ error: msg });
    }
    const { eventId, email, forename, surname, billingLine1, billingLine2, billingCity, billingState, billingPostcode, billingCountry } = validation.data;
    const event = await eventService.findById(eventId);
    if (!event || String(event.productId) !== String(product.id)) {
      return res.status(400).json({ error: "Invalid session." });
    }
    if (event.eventStatus !== "active") {
      return res.status(400).json({ error: "This session is no longer available." });
    }
    if (!event.productVariantId) {
      return res.status(400).json({ error: "This session cannot be booked." });
    }
    const variant = await eventService.getVariantForEvent(event);
    if (!variant || !variant.active) {
      return res.status(400).json({ error: "This session is no longer available." });
    }
    if (variant.quantity != null && Number(variant.quantity) < 1) {
      return res.status(400).json({ error: "This session is sold out." });
    }
    const userId = req.user?.id || null;
    const sessionId = req.session && req.sessionID ? req.sessionID : null;
    if (!userId && !email) {
      return res.status(400).json({ error: "Email is required for guest checkout." });
    }
    // Require billing address for paid sessions (check variant price).
    const eventPriceRow = await eventService.getPriceForEvent(event);
    const isPaid = eventPriceRow && Number(eventPriceRow.amount) > 0;
    if (isPaid && (!billingLine1 || !billingCity || !billingPostcode || !billingCountry)) {
      return res.status(400).json({ error: "Billing address is required." });
    }
    let order;
    try {
      order = await orderService.createOrderFromEvent(eventId, userId, sessionId, {
        email, forename, surname, billingLine1, billingLine2, billingCity, billingState, billingPostcode, billingCountry,
        personType: req.user?.personType || 'private',
        companyName: req.user?.companyName || null,
        companyOib: req.user?.companyOib || null,
      });
    } catch (e) {
      return res.status(400).json({ error: e.message || "Could not create order." });
    }

    if (Number(order.total) === 0) {
      try {
        await orderService.fulfillFreeOrder(order.id);
        return res.json({ alreadyPaid: true, orderId: order.id });
      } catch (e) {
        const status = e.status ?? e.statusCode ?? 500;
        return res.status(status).json({ error: e.message || "Could not complete registration." });
      }
    }

    const gateway = getDefaultGateway();
    if (!gateway) {
      await orderService.cancelOrder(order.id).catch((e) =>
        logger.error("Event placeOrder: failed to cancel order (no gateway configured)", { orderId: order.id, error: e.message })
      );
      return res.status(503).json({ error: "Payment system is not configured." });
    }
    const gatewayEmail = (req.user && req.user.email) || (email && String(email).trim()) || null;
    const paymentMethodId = req.body && req.body.paymentMethodId ? String(req.body.paymentMethodId).trim() : null;
    const saveCardRaw = req.body && req.body.saveCard;
    const saveCard =
      saveCardRaw === "1" ||
      saveCardRaw === true ||
      saveCardRaw === "on" ||
      saveCardRaw === "true" ||
      (Array.isArray(saveCardRaw) && (saveCardRaw.includes("1") || saveCardRaw.includes(true)));
    const gatewayOptions = { email: gatewayEmail, saveCard };
    if (paymentMethodId && userId) {
      const list = await paymentMethodService.listByUser(userId);
      const owned = list.find((p) => p.stripePaymentMethodId === paymentMethodId);
      if (owned) gatewayOptions.paymentMethodId = paymentMethodId;
    }
    try {
      const result = await gateway.createInvoiceForOrder(order.id, userId, sessionId, gatewayOptions);
      if (!result) {
        // Treat a missing result the same as a thrown error so the catch handles cleanup.
        throw new Error("Could not create payment.");
      }
      if (result.alreadyPaid) {
        return res.json({ alreadyPaid: true, orderId: order.id });
      }
      if (!result.clientSecret) {
        throw new Error("Could not create payment.");
      }
      return res.json({ clientSecret: result.clientSecret, orderId: order.id });
    } catch (err) {
      await orderService.cancelOrder(order.id).catch((cancelErr) =>
        logger.error("Event placeOrder: failed to cancel order after payment failure", { orderId: order.id, error: cancelErr.message })
      );
      const status = err.status ?? err.statusCode ?? 500;
      return res.status(status).json({ error: err.message || "Could not create payment." });
    }
  },

  /**
   * GET /:slug/buy — Redirect to register page (legacy link support).
   */
  redirectBuyToRegister(req, res) {
    const { slug } = req.params;
    const sectionPath = req.sectionPath;
    return res.redirect(302, "/" + sectionPath + "/" + slug + "/register");
  },
};
