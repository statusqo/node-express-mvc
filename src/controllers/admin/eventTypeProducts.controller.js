/**
 * Admin controller for event-type product sections (Webinars, Seminars, Classrooms).
 * Expects req.eventTypeSlug ('webinar'|'seminar'|'classroom') and req.sectionPath ('webinars'|'seminars'|'classrooms') set by route middleware.
 * Events page: inline add/edit/delete with single Save.
 */
const productService = require("../../services/product.service");
const eventService = require("../../services/event.service");
const { validateEventForm } = require("../../validators/event.schema");
const { ProductPrice, ProductVariant, EventMeeting, AdminZoomAccount, Registration } = require("../../models");
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
    const typeSlug = req.eventTypeSlug;
    const sectionPath = req.sectionPath;
    if (!typeSlug || !sectionPath) {
      res.setFlash("error", "Invalid section.");
      return res.redirect((req.adminPrefix || "") + "/");
    }
    const products = await productService.findAllByTypeSlug(typeSlug);
    const list = (products || []).map((p) => {
      const plain = toPlain(p);
      const variant = plain.ProductVariants && plain.ProductVariants[0];
      const priceRow = variant?.ProductPrices?.[0];
      return {
        ...plain,
        priceAmount: priceRow ? Number(priceRow.amount) : null,
        currency: priceRow?.currency || "USD",
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
    const typeSlug = req.eventTypeSlug;
    const sectionPath = req.sectionPath;
    if (!typeSlug || !sectionPath) {
      res.setFlash("error", "Invalid section.");
      return res.redirect((req.adminPrefix || "") + "/");
    }
    const product = await productService.findBySlugWithTypeAndDefaultVariant(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath);
    }
    const plain = toPlain(product);
    const productTypeSlug = plain.ProductType && plain.ProductType.slug;
    if (productTypeSlug !== typeSlug) {
      res.setFlash("error", "Product does not belong to this section.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath);
    }
    const events = await eventService.findByProductId(product.id, {
      include: [ProductVariant, { model: EventMeeting, as: "EventMeeting", required: false }, { model: Registration, as: "Registrations", required: false, attributes: ["id"] }],
    });
    const eventsPlain = (events || []).map(toPlain);
    const eventsWithPrice = await Promise.all(
      eventsPlain.map(async (ev) => {
        const priceRow =
          ev.productVariantId
            ? await ProductPrice.findOne({ where: { productVariantId: ev.productVariantId, isDefault: true } })
            : null;
        const seatsRemaining =
          ev.ProductVariant && ev.ProductVariant.quantity != null ? Number(ev.ProductVariant.quantity) : null;
        const hasMeeting = ev.isOnline && ev.EventMeeting && ev.EventMeeting.providerMeetingId;
        const meetingLinkStatus = !ev.isOnline ? null : ev.eventStatus === "active" && hasMeeting ? "synced" : "not_synced";
        const registrationCount = ev.Registrations ? ev.Registrations.length : 0;
        return {
          ...ev,
          priceAmount: priceRow ? Number(priceRow.amount) : null,
          currency: priceRow?.currency || "USD",
          seatsRemaining,
          meetingLinkStatus,
          registrationCount,
        };
      })
    );
    const zoomConnected = req.user && req.user.id
      ? !!(await AdminZoomAccount.findOne({ where: { userId: req.user.id } }))
      : false;
    const defaultVariant = plain.ProductVariants && plain.ProductVariants[0];
    const priceRow = defaultVariant?.ProductPrices?.[0];
    res.render("admin/event-type-products/events", {
      title: "Events – " + plain.title,
      product: {
        ...plain,
        priceAmount: priceRow ? Number(priceRow.amount) : null,
        currency: priceRow?.currency || "USD",
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
    const typeSlug = req.eventTypeSlug;
    if (!typeSlug || !sectionPath) {
      res.setFlash("error", "Invalid section.");
      return res.redirect((req.adminPrefix || "") + "/");
    }
    const product = await productService.findBySlugWithTypeAndDefaultVariant(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath);
    }
    const plain = toPlain(product);
    if (plain.ProductType && plain.ProductType.slug !== typeSlug) {
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
        currency: priceRow?.currency || "USD",
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
    const product = await productService.findBySlugWithTypeAndDefaultVariant(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath);
    }
    const plain = toPlain(product);
    if (plain.ProductType && plain.ProductType.slug !== req.eventTypeSlug) {
      res.setFlash("error", "Product does not belong to this section.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath);
    }
    const result = validateEventForm(req.body);
    if (!result.ok) {
      const defaultVariant = plain.ProductVariants && plain.ProductVariants[0];
      const priceRow = defaultVariant?.ProductPrices?.[0];
      return res.status(400).render("admin/event-type-products/event-form", {
        title: "New Event – " + plain.title,
        product: { ...plain, priceAmount: priceRow ? Number(priceRow.amount) : null, currency: priceRow?.currency || "USD" },
        sectionPath,
        typeLabel: getTypeLabel(sectionPath),
        event: { ...req.body, isOnline: req.body.isOnline === "1" || req.body.isOnline === true },
        isEdit: false,
        error: result.errors?.[0]?.message || "Validation failed.",
      });
    }
    try {
      await eventService.create(product.id, result.data);
      res.setFlash("success", "Event created.");
    } catch (e) {
      res.setFlash("error", e.message || "Failed to create event.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events/new");
    }
    res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events");
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
    const product = await productService.findBySlugWithTypeAndDefaultVariant(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath);
    }
    const targetEvent = await eventService.findById(eventId);
    if (!targetEvent || String(targetEvent.productId) !== String(toPlain(product).id)) {
      res.setFlash("error", "Event not found or does not belong to this product.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events");
    }
    const { deleted, error } = await eventService.delete(eventId);
    if (deleted) {
      res.setFlash("success", "Event removed.");
    } else {
      res.setFlash("error", error || "Could not remove event.");
    }
    res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events");
  },

  /**
   * POST .../events/sync-zoom — Sync this product's online events with Zoom.
   */
  async syncZoom(req, res) {
    const { productSlug } = req.params;
    const sectionPath = req.sectionPath;
    const product = await productService.findBySlugWithTypeAndDefaultVariant(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath);
    }
    const plain = toPlain(product);
    if (plain.ProductType && plain.ProductType.slug !== req.eventTypeSlug) {
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
    const product = await productService.findBySlugWithTypeAndDefaultVariant(productSlug);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath);
    }
    const plain = toPlain(product);
    if (plain.ProductType && plain.ProductType.slug !== req.eventTypeSlug) {
      res.setFlash("error", "Product does not belong to this section.");
      return res.redirect((req.adminPrefix || "") + "/" + sectionPath);
    }
    const events = Array.isArray(req.body.events) ? req.body.events : [];
    const rawDeleted = req.body.deletedIds;
    const deletedIds = Array.isArray(rawDeleted) ? rawDeleted : (rawDeleted ? [rawDeleted] : []);
    try {
      await eventService.saveEventsForProduct(product.id, { events, deletedIds });
      const allEvents = await eventService.findByProductId(product.id);
      let zoomError = null;
      for (const ev of allEvents || []) {
        if (ev.isOnline && ev.eventStatus === "active") {
          const result = await eventService.ensureMeetingForOnlineEvent(ev.id, req.user.id);
          if (result.error) {
            zoomError = result.error;
            break;
          }
        }
      }
      // Only surface Zoom errors when Zoom is actually configured — if it isn't, the
      // not_synced badge is sufficient feedback and no error message is needed.
      if (zoomError && config.zoom && config.zoom.clientId) {
        res.setFlash("error", `Events saved. Zoom: ${zoomError}`);
      } else {
        res.setFlash("success", "Events saved.");
      }
    } catch (e) {
      res.setFlash("error", e.message || "Failed to save events.");
    }
    res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events");
  },

  /**
   * POST .../events/cancel-event — Cancel an event (refund, delete registrations, etc.). Body: eventId, confirm=1.
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
    const product = await productService.findBySlugWithTypeAndDefaultVariant(productSlug);
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
      const result = await eventService.cancelEventAndCleanup(eventId);
      if (result.cancelled) {
        res.setFlash("success", "Event cancelled. Registrations removed, orders refunded, and attendees notified.");
      } else {
        res.setFlash("error", result.error || "Cancel failed.");
      }
    } catch (e) {
      res.setFlash("error", e.message || "Cancel failed.");
    }
    res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events");
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
    const product = await productService.findBySlugWithTypeAndDefaultVariant(productSlug);
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
    res.redirect((req.adminPrefix || "") + "/" + sectionPath + "/" + productSlug + "/events");
  },
};
