/**
 * Admin controller for event-type product sections.
 * Handles all products with ProductType "event" across any category (webinars, classrooms, seminars, etc.).
 * categorySlug comes from req.params.categorySlug — no route middleware needed.
 */
const productService = require("../../services/product.service");
const eventService = require("../../services/event.service");
const zoomService = require("../../services/zoom.service");
const { validateEventForm } = require("../../validators/event.schema");
const config = require("../../config");
const { DEFAULT_CURRENCY } = require("../../config/constants");

function toPlain(obj) {
  return obj && typeof obj.get === "function" ? obj.get({ plain: true }) : obj;
}

module.exports = {
  /**
   * GET /admin/events
   * Cards overview — one card per distinct ProductCategory found among ProductType "event" products.
   */
  async categoryIndex(req, res) {
    const products = await productService.findAllByTypeSlug("event");
    const allProducts = (products || []).map(toPlain);

    // Aggregate event status counts per category in one query
    const productIds = allProducts.map((p) => p.id).filter(Boolean);
    const statusRows = await eventService.countStatusByProductIds(productIds);
    const productStatusMap = {};
    for (const row of statusRows) {
      if (!productStatusMap[row.productId]) {
        productStatusMap[row.productId] = { active: 0, orphaned: 0, cancelled: 0 };
      }
      const status = row.eventStatus;
      if (status === "active" || status === "orphaned" || status === "cancelled") {
        productStatusMap[row.productId][status] = Number(row.count);
      }
    }

    const categoryMap = {};
    for (const plain of allProducts) {
      const cat = plain.ProductCategory;
      if (!cat) continue;
      if (!categoryMap[cat.slug]) {
        categoryMap[cat.slug] = { name: cat.name, slug: cat.slug, active: 0, orphaned: 0, cancelled: 0 };
      }
      const ps = productStatusMap[plain.id] || {};
      categoryMap[cat.slug].active += ps.active || 0;
      categoryMap[cat.slug].orphaned += ps.orphaned || 0;
      categoryMap[cat.slug].cancelled += ps.cancelled || 0;
    }
    const categories = Object.values(categoryMap);
    res.render("admin/events/category-index", { title: "Events", categories });
  },

  /**
   * GET /admin/events/:categorySlug
   * Table of all products in the given category.
   */
  async index(req, res) {
    const categorySlug = req.params.categorySlug;
    const sectionPath = "events/" + categorySlug;
    const products = await productService.findAllByCategorySlug(categorySlug);
    const list = (products || []).map((p) => {
      const plain = toPlain(p);
      const variant = plain.ProductVariants && plain.ProductVariants[0];
      const priceRow = variant?.ProductPrices?.[0];
      return {
        ...plain,
        priceAmount: priceRow ? Number(priceRow.amount) : null,
        currency: DEFAULT_CURRENCY,
        quantity: variant && variant.quantity != null ? variant.quantity : 0,
      };
    });
    const typeLabel = categorySlug.charAt(0).toUpperCase() + categorySlug.slice(1);
    res.render("admin/events/index", {
      title: typeLabel,
      products: list,
      sectionPath,
      typeLabel,
    });
  },

  /**
   * GET /admin/events/:categorySlug/:productSlug/events
   */
  async eventsPage(req, res) {
    const { categorySlug, productSlug } = req.params;
    const sectionPath = "events/" + categorySlug;
    const product = await productService.findBySlugWithTypeAndCategoryAndDefaultVariant(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/events/" + categorySlug);
    }
    const plain = toPlain(product);
    const productCategorySlug = plain.ProductCategory && plain.ProductCategory.slug;
    if (productCategorySlug !== categorySlug) {
      res.setFlash("error", "Product does not belong to this category.");
      return res.redirect((req.adminPrefix || "") + "/events/" + categorySlug);
    }
    const eventsWithDetails = await eventService.findByProductIdForAdmin(product.id);
    const eventsWithPrice = (eventsWithDetails || []).map((ev) => {
      const seatsRemaining =
        ev.ProductVariant && ev.ProductVariant.quantity != null ? Number(ev.ProductVariant.quantity) : null;
      const hasMeeting = ev.isOnline && ev.EventMeeting && ev.EventMeeting.zoomMeetingId;
      const meetingLinkStatus = !ev.isOnline ? null : ev.eventStatus === "active" && hasMeeting ? "synced" : "not_synced";
      const registrationCount = ev.Registrations ? ev.Registrations.length : 0;
      return {
        ...ev,
        priceAmount: ev.priceRow ? Number(ev.priceRow.amount) : null,
        currency: DEFAULT_CURRENCY,
        seatsRemaining,
        meetingLinkStatus,
        registrationCount,
      };
    });
    const zoomConnected = await (async () => {
      if (!req.user || !req.user.id) return false;
      if (!config.zoom || !config.zoom.clientId || !config.zoom.clientSecret) return false;
      const account = await zoomService.findAccountByUserId(req.user.id);
      if (!account) return false;
      const expiresAt = account.tokenExpiresAt ? new Date(account.tokenExpiresAt).getTime() : null;
      const tokenExpired = expiresAt !== null && expiresAt <= Date.now();
      if (tokenExpired && !account.refreshToken) return false;
      return true;
    })();
    const defaultVariant = plain.ProductVariants && plain.ProductVariants[0];
    const priceRow = defaultVariant?.ProductPrices?.[0];
    const typeLabel = categorySlug.charAt(0).toUpperCase() + categorySlug.slice(1);
    res.render("admin/events/events", {
      title: "Events – " + plain.title,
      product: {
        ...plain,
        priceAmount: priceRow ? Number(priceRow.amount) : null,
        currency: DEFAULT_CURRENCY,
      },
      events: eventsWithPrice,
      sectionPath,
      typeLabel,
      zoomConnected,
    });
  },

  /**
   * GET /admin/events/:categorySlug/:productSlug/events/new
   */
  async newEventForm(req, res) {
    const { categorySlug, productSlug } = req.params;
    const sectionPath = "events/" + categorySlug;
    const product = await productService.findBySlugWithTypeAndCategoryAndDefaultVariant(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/events/" + categorySlug);
    }
    const plain = toPlain(product);
    if (plain.ProductCategory && plain.ProductCategory.slug !== categorySlug) {
      res.setFlash("error", "Product does not belong to this category.");
      return res.redirect((req.adminPrefix || "") + "/events/" + categorySlug);
    }
    const defaultVariant = plain.ProductVariants && plain.ProductVariants[0];
    const priceRow = defaultVariant?.ProductPrices?.[0];
    const typeLabel = categorySlug.charAt(0).toUpperCase() + categorySlug.slice(1);
    res.render("admin/events/event-form", {
      title: "New Event – " + plain.title,
      product: {
        ...plain,
        priceAmount: priceRow ? Number(priceRow.amount) : null,
        currency: DEFAULT_CURRENCY,
      },
      sectionPath,
      typeLabel,
      event: null,
      isEdit: false,
    });
  },

  /**
   * POST /admin/events/:categorySlug/:productSlug/events/new
   */
  async createEvent(req, res) {
    const { categorySlug, productSlug } = req.params;
    const sectionPath = "events/" + categorySlug;
    const product = await productService.findBySlugWithTypeAndCategoryAndDefaultVariant(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/events/" + categorySlug);
    }
    const plain = toPlain(product);
    if (plain.ProductCategory && plain.ProductCategory.slug !== categorySlug) {
      res.setFlash("error", "Product does not belong to this category.");
      return res.redirect((req.adminPrefix || "") + "/events/" + categorySlug);
    }
    const result = validateEventForm(req.body);
    if (!result.ok) {
      const defaultVariant = plain.ProductVariants && plain.ProductVariants[0];
      const priceRow = defaultVariant?.ProductPrices?.[0];
      const typeLabel = categorySlug.charAt(0).toUpperCase() + categorySlug.slice(1);
      return res.status(400).render("admin/events/event-form", {
        title: "New Event – " + plain.title,
        product: { ...plain, priceAmount: priceRow ? Number(priceRow.amount) : null, currency: DEFAULT_CURRENCY },
        sectionPath,
        typeLabel,
        event: { ...req.body, isOnline: req.body.isOnline === "1" || req.body.isOnline === true },
        isEdit: false,
        error: result.errors?.[0]?.message || "Validation failed.",
      });
    }
    try {
      const newEvent = await eventService.create(product.id, result.data);
      if (newEvent && newEvent.isOnline && newEvent.eventStatus === "active") {
        const meetingResult = await eventService.ensureMeetingForOnlineEvent(newEvent.id, req.user.id);
        if (meetingResult.error && config.zoom && config.zoom.clientId) {
          res.setFlash("success", `Event created. Zoom: ${meetingResult.error}`);
          return res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events");
        }
      }
      res.setFlash("success", "Event created.");
    } catch (e) {
      res.setFlash("error", e.message || "Failed to create event.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events/new");
    }
    res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events");
  },

  /**
   * GET /admin/events/:categorySlug/:productSlug/events/:eventId/edit
   */
  async editEventForm(req, res) {
    const { categorySlug, productSlug, eventId } = req.params;
    const sectionPath = "events/" + categorySlug;
    const product = await productService.findBySlugWithTypeAndCategoryAndDefaultVariant(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/events/" + categorySlug);
    }
    const plain = toPlain(product);
    if (plain.ProductCategory && plain.ProductCategory.slug !== categorySlug) {
      res.setFlash("error", "Product does not belong to this category.");
      return res.redirect((req.adminPrefix || "") + "/events/" + categorySlug);
    }
    const ev = await eventService.findByIdForAdmin(eventId);
    if (!ev || String(ev.productId) !== String(plain.id)) {
      res.setFlash("error", "Event not found.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events");
    }
    const hasMeeting = ev.isOnline && ev.EventMeeting && ev.EventMeeting.zoomMeetingId;
    const meetingLinkStatus = !ev.isOnline ? null : ev.eventStatus === "active" && hasMeeting ? "synced" : "not_synced";
    const registrationCount = ev.Registrations ? ev.Registrations.length : 0;
    const defaultVariant = plain.ProductVariants && plain.ProductVariants[0];
    const productPriceRow = defaultVariant?.ProductPrices?.[0];
    const typeLabel = categorySlug.charAt(0).toUpperCase() + categorySlug.slice(1);
    res.render("admin/events/event-form", {
      title: "Edit Event – " + plain.title,
      product: {
        ...plain,
        priceAmount: productPriceRow ? Number(productPriceRow.amount) : null,
        currency: DEFAULT_CURRENCY,
      },
      event: {
        ...ev,
        priceAmount: ev.priceRow ? Number(ev.priceRow.amount) : null,
        currency: DEFAULT_CURRENCY,
        meetingLinkStatus,
        registrationCount,
      },
      sectionPath,
      typeLabel,
      isEdit: true,
    });
  },

  /**
   * POST /admin/events/:categorySlug/:productSlug/events/remove-event
   */
  async removeEvent(req, res) {
    const { categorySlug, productSlug } = req.params;
    const sectionPath = "events/" + categorySlug;
    const eventId = req.body.eventId ? String(req.body.eventId).trim() : null;
    if (!eventId) {
      res.setFlash("error", "Invalid request.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events");
    }
    const product = await productService.findBySlugWithTypeAndCategoryAndDefaultVariant(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/events/" + categorySlug);
    }
    const targetEvent = await eventService.findById(eventId);
    if (!targetEvent || String(targetEvent.productId) !== String(toPlain(product).id)) {
      res.setFlash("error", "Event not found or does not belong to this product.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events");
    }
    if (targetEvent.eventStatus !== "cancelled") {
      res.setFlash("error", "Only cancelled events can be removed.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events");
    }
    const { deleted, error } = await eventService.delete(eventId);
    if (deleted) {
      res.setFlash("success", "Event removed.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events");
    }
    res.setFlash("error", error || "Could not remove event.");
    res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events/" + eventId + "/edit");
  },

  /**
   * POST /admin/events/:categorySlug/:productSlug/events/sync-zoom
   */
  async syncZoom(req, res) {
    const { categorySlug, productSlug } = req.params;
    const sectionPath = "events/" + categorySlug;
    const product = await productService.findBySlugWithTypeAndCategoryAndDefaultVariant(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/events/" + categorySlug);
    }
    const plain = toPlain(product);
    if (plain.ProductCategory && plain.ProductCategory.slug !== categorySlug) {
      res.setFlash("error", "Product does not belong to this category.");
      return res.redirect((req.adminPrefix || "") + "/events/" + categorySlug);
    }
    try {
      const { created, errors } = await eventService.syncProductEvents(product.id, req.user.id);
      if (errors.length) {
        res.setFlash("error", errors[0] || "Some meetings could not be created.");
      } else if (created > 0) {
        res.setFlash("success", `Created ${created} meeting(s) on Zoom.`);
      } else {
        res.setFlash("info", "All online events already have Zoom meetings.");
      }
    } catch (e) {
      res.setFlash("error", e.message || "Sync failed.");
    }
    res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events");
  },

  /**
   * POST /admin/events/:categorySlug/:productSlug/events (bulk save)
   */
  async eventsSave(req, res) {
    const { categorySlug, productSlug } = req.params;
    const sectionPath = "events/" + categorySlug;
    const product = await productService.findBySlugWithTypeAndCategoryAndDefaultVariant(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/events/" + categorySlug);
    }
    const plain = toPlain(product);
    if (plain.ProductCategory && plain.ProductCategory.slug !== categorySlug) {
      res.setFlash("error", "Product does not belong to this category.");
      return res.redirect((req.adminPrefix || "") + "/events/" + categorySlug);
    }
    const events = Array.isArray(req.body.events) ? req.body.events : [];
    const rawDeleted = req.body.deletedIds;
    const deletedIds = Array.isArray(rawDeleted) ? rawDeleted : (rawDeleted ? [rawDeleted] : []);
    try {
      await eventService.saveEventsForProduct(product.id, { events, deletedIds });
      const allEvents = await eventService.findByProductId(product.id);
      const zoomErrors = [];
      for (const ev of allEvents || []) {
        if (ev.isOnline && ev.eventStatus === "active") {
          const result = await eventService.ensureMeetingForOnlineEvent(ev.id, req.user.id);
          if (result.error) zoomErrors.push(result.error);
        }
      }
      if (zoomErrors.length && config.zoom && config.zoom.clientId) {
        const uniqueErrors = [...new Set(zoomErrors)];
        const detail = uniqueErrors.length > 1
          ? `${uniqueErrors[0]} (and ${uniqueErrors.length - 1} more)`
          : uniqueErrors[0];
        res.setFlash("error", `Events saved. Zoom: ${detail}`);
      } else {
        res.setFlash("success", "Events saved.");
      }
    } catch (e) {
      res.setFlash("error", e.message || "Failed to save events.");
    }
    res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events");
  },

  /**
   * POST /admin/events/:categorySlug/:productSlug/events/cancel-event
   */
  async cancelEvent(req, res) {
    const { categorySlug, productSlug } = req.params;
    const sectionPath = "events/" + categorySlug;
    const eventId = req.body.eventId ? String(req.body.eventId).trim() : null;
    const confirm = req.body.confirm === "1" || req.body.confirm === true;
    if (!eventId || !confirm) {
      res.setFlash("error", "Invalid request. Use the Cancel button and confirm.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events");
    }
    const product = await productService.findBySlugWithTypeAndCategoryAndDefaultVariant(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/events/" + categorySlug);
    }
    const targetEvent = await eventService.findById(eventId);
    if (!targetEvent || String(targetEvent.productId) !== String(toPlain(product).id)) {
      res.setFlash("error", "Event not found or does not belong to this product.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events");
    }
    try {
      const result = await eventService.cancelEvent(eventId);
      if (result.cancelled) {
        res.setFlash("success", "Event cancelled.");
      } else {
        res.setFlash("error", result.error || "Cancel failed.");
      }
    } catch (e) {
      res.setFlash("error", e.message || "Cancel failed.");
    }
    res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events/" + eventId + "/edit");
  },

  /**
   * POST /admin/events/:categorySlug/:productSlug/events/process-refunds
   */
  async processEventCleanup(req, res) {
    const { categorySlug, productSlug } = req.params;
    const sectionPath = "events/" + categorySlug;
    const eventId = req.body.eventId ? String(req.body.eventId).trim() : null;
    const confirm = req.body.confirm === "1" || req.body.confirm === true;
    if (!eventId || !confirm) {
      res.setFlash("error", "Invalid request.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events");
    }
    const product = await productService.findBySlugWithTypeAndCategoryAndDefaultVariant(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/events/" + categorySlug);
    }
    const targetEvent = await eventService.findById(eventId);
    if (!targetEvent || String(targetEvent.productId) !== String(toPlain(product).id)) {
      res.setFlash("error", "Event not found or does not belong to this product.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events");
    }
    try {
      const result = await eventService.processEventRefundsAndCleanup(eventId);
      if (result.ok) {
        res.setFlash("success", `Processed ${result.processed} of ${result.total} registration(s).`);
      } else {
        const progress = result.total > 0 ? ` (${result.processed} of ${result.total} processed — retry to continue)` : "";
        res.setFlash("error", (result.error || "Processing failed.") + progress);
      }
    } catch (e) {
      res.setFlash("error", e.message || "Processing failed.");
    }
    res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events/" + eventId + "/edit");
  },

  /**
   * POST /admin/events/:categorySlug/:productSlug/events/reschedule-event
   */
  async rescheduleEvent(req, res) {
    const { categorySlug, productSlug } = req.params;
    const sectionPath = "events/" + categorySlug;
    const eventId = req.body.eventId ? String(req.body.eventId).trim() : null;
    if (!eventId) {
      res.setFlash("error", "Invalid request.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events");
    }
    const product = await productService.findBySlugWithTypeAndCategoryAndDefaultVariant(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/events/" + categorySlug);
    }
    const plain = toPlain(product);
    if (plain.ProductCategory && plain.ProductCategory.slug !== categorySlug) {
      res.setFlash("error", "Product does not belong to this category.");
      return res.redirect((req.adminPrefix || "") + "/events/" + categorySlug);
    }
    const targetEvent = await eventService.findById(eventId);
    if (!targetEvent || String(targetEvent.productId) !== String(plain.id)) {
      res.setFlash("error", "Event not found or does not belong to this product.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events");
    }
    const result = validateEventForm(req.body);
    if (!result.ok) {
      res.setFlash("error", result.errors?.[0]?.message || "Validation failed.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events/" + eventId + "/edit");
    }
    try {
      const rescheduleResult = await eventService.rescheduleEvent(eventId, result.data, req.user.id);
      if (!rescheduleResult.rescheduled) {
        res.setFlash("error", rescheduleResult.error || "Reschedule failed.");
        return res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events/" + eventId + "/edit");
      }
      if (rescheduleResult.zoomErrors && rescheduleResult.zoomErrors.length > 0) {
        res.setFlash("success", "Event rescheduled. Some registrants could not be added to Zoom — check the registrants page to retry.");
      } else {
        res.setFlash("success", "Event rescheduled.");
      }
    } catch (e) {
      res.setFlash("error", e.message || "Reschedule failed.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events/" + eventId + "/edit");
    }
    res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events/" + eventId + "/edit");
  },

  /**
   * POST /admin/events/:categorySlug/:productSlug/events/resync-event
   */
  async resyncEvent(req, res) {
    const { categorySlug, productSlug } = req.params;
    const sectionPath = "events/" + categorySlug;
    const eventId = req.body.eventId ? String(req.body.eventId).trim() : null;
    if (!eventId) {
      res.setFlash("error", "Invalid request.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events");
    }
    const product = await productService.findBySlugWithTypeAndCategoryAndDefaultVariant(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/events/" + categorySlug);
    }
    const targetEvent = await eventService.findById(eventId);
    if (!targetEvent || String(targetEvent.productId) !== String(toPlain(product).id)) {
      res.setFlash("error", "Event not found or does not belong to this product.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events");
    }
    try {
      const result = await eventService.resyncOrphanedEvent(eventId, req.user.id);
      if (result.ok) {
        res.setFlash("success", "Event re-synced with Zoom. New meeting created and registrants added.");
      } else {
        res.setFlash("error", result.error || "Re-sync failed.");
      }
    } catch (e) {
      res.setFlash("error", e.message || "Re-sync failed.");
    }
    res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events/" + eventId + "/edit");
  },
};
