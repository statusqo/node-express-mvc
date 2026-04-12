/**
 * Public controller for event-type products (webinars, classrooms, seminars, etc.).
 * All routes are under /events. categorySlug comes from req.params.categorySlug.
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

module.exports = {
  /**
   * GET /events
   * Category picker — groups all active event products by ProductCategory.
   */
  async index(req, res) {
    const products = await productService.findAllByTypeSlug("event");
    const categoryMap = {};
    for (const p of products || []) {
      const plain = toPlain(p);
      if (!plain.active) continue;
      const cat = plain.ProductCategory;
      if (!cat) continue;
      if (!categoryMap[cat.slug]) {
        categoryMap[cat.slug] = { name: cat.name, slug: cat.slug };
      }
    }
    const categories = Object.values(categoryMap);
    res.render("web/events/index", { title: "Events", categories });
  },

  /**
   * GET /events/:categorySlug
   * Product listing for a single event category.
   */
  async categoryListing(req, res) {
    const { categorySlug } = req.params;
    const products = await productService.findAllByCategorySlug(categorySlug);
    const activeProducts = (products || []).filter((p) => {
      const plain = toPlain(p);
      return plain.active && plain.ProductType && plain.ProductType.slug === "event";
    });
    if (!activeProducts.length) {
      return res.redirect("/events");
    }
    const categoryName = toPlain(activeProducts[0]).ProductCategory
      ? toPlain(activeProducts[0]).ProductCategory.name
      : categorySlug;

    // Fetch active sessions for all products in parallel, attach product info to each
    const sessionsByProduct = await Promise.all(
      activeProducts.map(async (p) => {
        const plain = toPlain(p);
        const events = await eventService.findActiveByProductIdWithVariant(plain.id);
        return (events || []).map(toPlain).map((ev) => ({
          ...ev,
          productTitle: plain.title,
          productSlug: plain.slug,
          seatsRemaining: ev.ProductVariant && ev.ProductVariant.quantity != null
            ? Number(ev.ProductVariant.quantity)
            : 0,
        }));
      })
    );
    const sessions = sessionsByProduct.flat();

    res.render("web/events/category", {
      title: categoryName,
      categoryName,
      categorySlug,
      sessions,
    });
  },

  /**
   * GET /events/:categorySlug/:productSlug
   * Product detail page.
   */
  async show(req, res) {
    const { categorySlug, productSlug } = req.params;
    const sectionPath = "events/" + categorySlug;
    const product = await productService.findActiveBySlugWithTypeAndCategory(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect("/events");
    }
    const plain = toPlain(product);
    const productCategorySlug = plain.ProductCategory && plain.ProductCategory.slug;
    if (productCategorySlug !== categorySlug) {
      res.setFlash("error", "Product not found.");
      return res.redirect("/events");
    }
    const events = await eventService.findActiveByProductIdWithVariant(product.id);
    const eventsPlain = (events || []).map(toPlain);
    res.render("web/events/show", {
      title: plain.title,
      product: plain,
      events: eventsPlain,
      sectionPath,
      categorySlug,
    });
  },

  /**
   * GET /events/:categorySlug/:productSlug/register?eventId=
   * Event registration / checkout page.
   */
  async registerForm(req, res) {
    const { categorySlug, productSlug } = req.params;
    const sectionPath = "events/" + categorySlug;
    const eventId = req.query.eventId ? String(req.query.eventId).trim() : null;
    if (!eventId) {
      res.setFlash("error", "Please select a session.");
      return res.redirect("/" + sectionPath + "/" + productSlug);
    }
    const product = await productService.findActiveBySlugWithTypeAndCategory(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect("/events");
    }
    const plain = toPlain(product);
    if (plain.ProductCategory && plain.ProductCategory.slug !== categorySlug) {
      res.setFlash("error", "Product not found.");
      return res.redirect("/events");
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
    res.render("web/events/register", {
      title: "Register: " + plain.title,
      product: plain,
      event: eventPlain,
      seatsRemaining,
      sectionPath,
      categorySlug,
      priceAmount,
      currency,
      stripePublishableKey: config.stripe?.publishableKey || "",
      user: userPlain,
      paymentMethods,
      checkoutVatEnabled,
    });
  },

  /**
   * POST /events/:categorySlug/:productSlug/place-order
   * Create order from event + PaymentIntent; returns { clientSecret, orderId }.
   */
  async placeOrder(req, res) {
    const { categorySlug, productSlug } = req.params;
    const product = await productService.findActiveBySlugWithTypeAndCategory(productSlug);
    if (!product) {
      return res.status(404).json({ error: "Product not found." });
    }
    const plain = toPlain(product);
    if (plain.ProductCategory && plain.ProductCategory.slug !== categorySlug) {
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
    const eventPriceRow = await eventService.getPriceForEvent(event);
    const isPaid = eventPriceRow && Number(eventPriceRow.amount) > 0;
    if (isPaid && (!billingLine1 || !billingCity || !billingPostcode || !billingCountry)) {
      return res.status(400).json({ error: "Billing address is required." });
    }
    let order;
    try {
      order = await orderService.createOrderFromEvent(eventId, userId, sessionId, {
        email, forename, surname, billingLine1, billingLine2, billingCity, billingState, billingPostcode, billingCountry,
        personType: req.user?.personType || "private",
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
   * GET /events/:categorySlug/:productSlug/buy — legacy redirect to register page.
   */
  redirectBuyToRegister(req, res) {
    const { categorySlug, productSlug } = req.params;
    return res.redirect(302, "/events/" + categorySlug + "/" + productSlug + "/register");
  },
};
