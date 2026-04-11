/**
 * Admin controller for event-type product sections (Webinars, Classrooms).
 * Seminars use src/controllers/admin/seminars.controller.js (product list only, no Zoom).
 * Expects req.eventCategorySlug ('webinar'|'classroom') and req.sectionPath ('webinars'|'classrooms') set by route middleware.
 * Events page: inline add/edit/delete with single Save.
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

function getTypeLabel(sectionPath) {
  const labels = { webinars: "Webinars", classrooms: "Classrooms" };
  return labels[sectionPath] || sectionPath;
}

module.exports = {
  async index(req, res) {
    const categorySlug = req.eventCategorySlug;
    const sectionPath = req.sectionPath;
    if (!categorySlug || !sectionPath) {
      res.setFlash("error", "Invalid section.");
      return res.redirect((req.adminPrefix || "") + "/");
    }
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
    res.render("admin/event-type-products/index", {
      title: getTypeLabel(sectionPath),
      products: list,
      sectionPath,
      typeLabel: getTypeLabel(sectionPath),
    });
  },

  async eventsPage(req, res) {
    const { productSlug } = req.params;
    const categorySlug = req.eventCategorySlug;
    const sectionPath = req.sectionPath;
    if (!categorySlug || !sectionPath) {
      res.setFlash("error", "Invalid section.");
      return res.redirect((req.adminPrefix || "") + "/");
    }
    const product = await productService.findBySlugWithTypeAndCategoryAndDefaultVariant(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath);
    }
    const plain = toPlain(product);
    const productCategorySlug = plain.ProductCategory && plain.ProductCategory.slug;
    if (productCategorySlug !== categorySlug) {
      res.setFlash("error", "Product does not belong to this section.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath);
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
    // Mirror the token-validity logic from admin.service.js: presence alone is not
    // enough — an expired token with no refresh token cannot be used.
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
    res.render("admin/event-type-products/events", {
      title: "Events – " + plain.title,
      product: {
        ...plain,
        priceAmount: priceRow ? Number(priceRow.amount) : null,
        currency: DEFAULT_CURRENCY,
      },
      events: eventsWithPrice,
      sectionPath,
      typeLabel: getTypeLabel(sectionPath),
      zoomConnected,
    });
  },

  /**
   * GET .../events/new — New Event form (same flow as New Collection / New Product).
   */
  async newEventForm(req, res) {
    const { productSlug } = req.params;
    const sectionPath = req.sectionPath;
    const categorySlug = req.eventCategorySlug;
    if (!categorySlug || !sectionPath) {
      res.setFlash("error", "Invalid section.");
      return res.redirect((req.adminPrefix || "") + "/");
    }
    const product = await productService.findBySlugWithTypeAndCategoryAndDefaultVariant(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath);
    }
    const plain = toPlain(product);
    if (plain.ProductCategory && plain.ProductCategory.slug !== categorySlug) {
      res.setFlash("error", "Product does not belong to this section.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath);
    }
    const defaultVariant = plain.ProductVariants && plain.ProductVariants[0];
    const priceRow = defaultVariant?.ProductPrices?.[0];
    res.render("admin/event-type-products/event-form", {
      title: "New Event – " + plain.title,
      product: {
        ...plain,
        priceAmount: priceRow ? Number(priceRow.amount) : null,
        currency: DEFAULT_CURRENCY,
      },
      sectionPath,
      typeLabel: getTypeLabel(sectionPath),
      event: null,
      isEdit: false,
    });
  },

  /**
   * POST .../events/new — Create one event and redirect to events list.
   */
  async createEvent(req, res) {
    const { productSlug } = req.params;
    const sectionPath = req.sectionPath;
    const product = await productService.findBySlugWithTypeAndCategoryAndDefaultVariant(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath);
    }
    const plain = toPlain(product);
    if (plain.ProductCategory && plain.ProductCategory.slug !== req.eventCategorySlug) {
      res.setFlash("error", "Product does not belong to this section.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath);
    }
    const result = validateEventForm(req.body);
    if (!result.ok) {
      const defaultVariant = plain.ProductVariants && plain.ProductVariants[0];
      const priceRow = defaultVariant?.ProductPrices?.[0];
      return res.status(400).render("admin/event-type-products/event-form", {
        title: "New Event – " + plain.title,
        product: { ...plain, priceAmount: priceRow ? Number(priceRow.amount) : null, currency: DEFAULT_CURRENCY },
        sectionPath,
        typeLabel: getTypeLabel(sectionPath),
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
   * GET .../events/:eventId/edit — Edit Event form.
   */
  async editEventForm(req, res) {
    const { productSlug, eventId } = req.params;
    const sectionPath = req.sectionPath;
    const categorySlug = req.eventCategorySlug;
    if (!categorySlug || !sectionPath) {
      res.setFlash("error", "Invalid section.");
      return res.redirect((req.adminPrefix || "") + "/");
    }
    const product = await productService.findBySlugWithTypeAndCategoryAndDefaultVariant(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath);
    }
    const plain = toPlain(product);
    if (plain.ProductCategory && plain.ProductCategory.slug !== categorySlug) {
      res.setFlash("error", "Product does not belong to this section.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath);
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
    res.render("admin/event-type-products/event-form", {
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
      typeLabel: getTypeLabel(sectionPath),
      isEdit: true,
    });
  },

  /**
   * POST .../events/remove-event — Remove (delete) a cancelled event. Body: eventId.
   */
  async removeEvent(req, res) {
    const { productSlug } = req.params;
    const sectionPath = req.sectionPath;
    const eventId = req.body.eventId ? String(req.body.eventId).trim() : null;
    if (!eventId) {
      res.setFlash("error", "Invalid request.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events");
    }
    const product = await productService.findBySlugWithTypeAndCategoryAndDefaultVariant(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath);
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
   * POST .../events/sync-zoom — Sync this product's online events with Zoom.
   */
  async syncZoom(req, res) {
    const { productSlug } = req.params;
    const sectionPath = req.sectionPath;
    const product = await productService.findBySlugWithTypeAndCategoryAndDefaultVariant(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath);
    }
    const plain = toPlain(product);
    if (plain.ProductCategory && plain.ProductCategory.slug !== req.eventCategorySlug) {
      res.setFlash("error", "Product does not belong to this section.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath);
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

  async eventsSave(req, res) {
    const { productSlug } = req.params;
    const sectionPath = req.sectionPath;
    const product = await productService.findBySlugWithTypeAndCategoryAndDefaultVariant(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath);
    }
    const plain = toPlain(product);
    if (plain.ProductCategory && plain.ProductCategory.slug !== req.eventCategorySlug) {
      res.setFlash("error", "Product does not belong to this section.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath);
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
          if (result.error) {
            zoomErrors.push(result.error);
          }
        }
      }
      // Only surface Zoom errors when Zoom is actually configured — if it isn't, the
      // not_synced badge is sufficient feedback and no error message is needed.
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
   * POST .../events/cancel-event — Flow 1: Remove from Zoom and mark event as cancelled. Body: eventId, confirm=1.
   * Works for active and orphaned events. No registration or refund changes.
   */
  async cancelEvent(req, res) {
    const { productSlug } = req.params;
    const sectionPath = req.sectionPath;
    const eventId = req.body.eventId ? String(req.body.eventId).trim() : null;
    const confirm = req.body.confirm === "1" || req.body.confirm === true;
    if (!eventId || !confirm) {
      res.setFlash("error", "Invalid request. Use the Cancel button and confirm.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events");
    }
    const product = await productService.findBySlugWithTypeAndCategoryAndDefaultVariant(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath);
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
   * POST .../events/process-refunds — Flow 2: Process refunds and soft-delete registrations for a cancelled event. Body: eventId, confirm=1.
   * Idempotent: only processes registrations not yet soft-deleted. Bails on first Stripe failure.
   */
  async processEventCleanup(req, res) {
    const { productSlug } = req.params;
    const sectionPath = req.sectionPath;
    const eventId = req.body.eventId ? String(req.body.eventId).trim() : null;
    const confirm = req.body.confirm === "1" || req.body.confirm === true;
    if (!eventId || !confirm) {
      res.setFlash("error", "Invalid request.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events");
    }
    const product = await productService.findBySlugWithTypeAndCategoryAndDefaultVariant(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath);
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
   * POST .../events/reschedule-event — Update details of a cancelled event, create a new Zoom meeting,
   * re-add existing registrants, and set the event back to active. Body: eventId + event form fields.
   * Idempotent: safe to retry if Zoom or DB fails mid-way.
   */
  async rescheduleEvent(req, res) {
    const { productSlug } = req.params;
    const sectionPath = req.sectionPath;
    const eventId = req.body.eventId ? String(req.body.eventId).trim() : null;
    if (!eventId) {
      res.setFlash("error", "Invalid request.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events");
    }
    const product = await productService.findBySlugWithTypeAndCategoryAndDefaultVariant(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath);
    }
    const plain = toPlain(product);
    if (plain.ProductCategory && plain.ProductCategory.slug !== req.eventCategorySlug) {
      res.setFlash("error", "Product does not belong to this section.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath);
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
        res.setFlash(
          "success",
          "Event rescheduled. Some registrants could not be added to Zoom — check the registrants page to retry."
        );
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
   * POST .../events/resync-event — Re-sync an orphaned event (new meeting + add registrants). Body: eventId.
   */
  async resyncEvent(req, res) {
    const { productSlug } = req.params;
    const sectionPath = req.sectionPath;
    const eventId = req.body.eventId ? String(req.body.eventId).trim() : null;
    if (!eventId) {
      res.setFlash("error", "Invalid request.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events");
    }
    const product = await productService.findBySlugWithTypeAndCategoryAndDefaultVariant(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath);
    }
    // Verify the event belongs to this product before acting on it
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
