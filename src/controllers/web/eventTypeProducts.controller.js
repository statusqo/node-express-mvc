/**
 * Public controller for event-type product sections (Webinars, Seminars, Classrooms).
 * Expects req.typeSlug and req.sectionPath set by route middleware (e.g. typeSlug: 'webinar', sectionPath: 'webinars').
 */
const { ProductVariant } = require("../../models");
const productService = require("../../services/product.service");
const eventService = require("../../services/event.service");
const orderService = require("../../services/order.service");
const paymentMethodService = require("../../services/paymentMethod.service");
const { validateWebinarBuy } = require("../../validators/webinarBuy.schema");
const { getDefaultGateway } = require("../../gateways");
const config = require("../../config");

function toPlain(obj) {
  return obj && typeof obj.get === "function" ? obj.get({ plain: true }) : obj;
}

function getTypeLabel(sectionPath) {
  const labels = { webinars: "Webinars", seminars: "Seminars", classrooms: "Classrooms" };
  return labels[sectionPath] || sectionPath;
}

module.exports = {
  async index(req, res) {
    const typeSlug = req.typeSlug;
    const sectionPath = req.sectionPath;
    if (!typeSlug || !sectionPath) return res.redirect("/");
    const products = await productService.findAllByTypeSlug(typeSlug);
    const list = (products || []).map((p) => {
      const plain = toPlain(p);
      const variant = plain.ProductVariants && plain.ProductVariants[0];
      const priceRow = variant?.ProductPrices?.[0];
      return {
        ...plain,
        priceAmount: priceRow ? Number(priceRow.amount) : null,
        currency: priceRow?.currency || "USD",
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
    const product = await productService.findActiveBySlugWithType(slug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect("/" + sectionPath);
    }
    const plain = toPlain(product);
    const productTypeSlug = plain.ProductType && plain.ProductType.slug;
    if (productTypeSlug !== req.typeSlug) {
      res.setFlash("error", "Product not found.");
      return res.redirect("/" + sectionPath);
    }
    const events = await eventService.findActiveByProductId(product.id, {
      include: [ProductVariant],
    });
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
    const product = await productService.findActiveBySlugWithType(slug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect("/" + sectionPath);
    }
    const plain = toPlain(product);
    if (plain.ProductType && plain.ProductType.slug !== req.typeSlug) {
      res.setFlash("error", "Product not found.");
      return res.redirect("/" + sectionPath);
    }
    const event = await eventService.findById(eventId, { include: [ProductVariant] });
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
    const variant = plain.ProductVariants && plain.ProductVariants[0];
    const priceRow = variant && variant.ProductPrices && variant.ProductPrices[0];
    const priceAmount = priceRow ? Number(priceRow.amount) : null;
    const currency = priceRow ? priceRow.currency : "USD";
    let paymentMethods = [];
    if (req.user && req.user.id) {
      try {
        paymentMethods = await paymentMethodService.listByUser(req.user.id);
      } catch (e) {
        paymentMethods = [];
      }
    }
    const userPlain = req.user && typeof req.user.get === "function" ? req.user.get({ plain: true }) : req.user || null;
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
    });
  },

  /**
   * POST /:slug/place-order — Create order from event + PaymentIntent; return { clientSecret, orderId } (no redirect).
   */
  async placeOrder(req, res) {
    const { slug } = req.params;
    const sectionPath = req.sectionPath;
    const product = await productService.findActiveBySlugWithType(slug);
    if (!product) {
      return res.status(404).json({ error: "Product not found." });
    }
    const plain = toPlain(product);
    if (plain.ProductType && plain.ProductType.slug !== req.typeSlug) {
      return res.status(404).json({ error: "Product not found." });
    }
    const validation = validateWebinarBuy(req.body || {});
    if (!validation.ok) {
      const msg = (validation.errors && validation.errors[0] && validation.errors[0].message) || "Invalid input.";
      return res.status(400).json({ error: msg });
    }
    const { eventId, email, forename, surname } = validation.data;
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
    const variant = await ProductVariant.findByPk(event.productVariantId);
    if (!variant || (variant.quantity != null && Number(variant.quantity) < 1)) {
      return res.status(400).json({ error: "This session is sold out." });
    }
    const userId = req.user?.id || null;
    const sessionId = req.session && req.sessionID ? req.sessionID : null;
    if (!userId && !email) {
      return res.status(400).json({ error: "Email is required for guest checkout." });
    }
    let order;
    try {
      order = await orderService.createOrderFromEvent(eventId, userId, sessionId, { email, forename, surname });
    } catch (e) {
      return res.status(400).json({ error: e.message || "Could not create order." });
    }
    const gateway = getDefaultGateway();
    if (!gateway) {
      return res.status(503).json({ error: "Payment system is not configured." });
    }
    const gatewayEmail = (req.user && req.user.email) || (email && String(email).trim()) || null;
    const paymentMethodId = req.body && req.body.paymentMethodId ? String(req.body.paymentMethodId).trim() : null;
    const gatewayOptions = { email: gatewayEmail };
    if (paymentMethodId && userId) {
      const list = await paymentMethodService.listByUser(userId);
      const owned = list.find((p) => p.gatewayToken === paymentMethodId);
      if (owned) gatewayOptions.paymentMethodId = paymentMethodId;
    }
    try {
      const result = await gateway.createPaymentIntentForOrder(order.id, userId, sessionId, gatewayOptions);
      if (!result || !result.clientSecret) {
        return res.status(500).json({ error: "Could not create payment." });
      }
      return res.json({ clientSecret: result.clientSecret, orderId: order.id });
    } catch (err) {
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
