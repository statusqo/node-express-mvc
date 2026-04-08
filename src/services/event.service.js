/**
 * Event service - business logic for live sessions (each event = one ProductVariant + ProductPrice).
 * Price for new session variant is copied from product's default variant (blueprint).
 */
const { sequelize } = require("../db");
const logger = require("../config/logger");
const cartRepo = require("../repos/cart.repo");
const eventMeetingRepo = require("../repos/eventMeeting.repo");
const registrationRepo = require("../repos/registration.repo");
const { DEFAULT_CURRENCY } = require("../config/constants");
const productRepo = require("../repos/product.repo");
const eventRepo = require("../repos/event.repo");
const productVariantRepo = require("../repos/productVariant.repo");
const orderLineRepo = require("../repos/orderLine.repo");
const orderRepo = require("../repos/order.repo");
const { getMeetingProvider } = require("../gateways/meeting.interface");
const orderService = require("./order.service");
const emailService = require("./email.service");
const refundRequestRepo = require("../repos/refundRequest.repo");
const { REFUND_REQUEST_STATUS } = require("../constants/refundRequest");

function formatEventVariantTitle(startDate, startTime) {
  const d = startDate ? String(startDate).substring(0, 10) : "";
  const t = startTime != null ? String(startTime).substring(0, 5) : "";
  if (d && t) return `Event ${d} ${t}`;
  if (d) return `Event ${d}`;
  return "Event";
}

module.exports = {
  async findById(id, options = {}) {
    return await eventRepo.findById(id, options);
  },

  /**
   * Single event with ProductVariant, EventMeeting, and Registration count.
   * Used by the admin edit event form. Attaches priceRow to the returned plain object.
   */
  async findByIdForAdmin(eventId) {
    const eventRaw = await eventRepo.findByIdWithDetails(eventId);
    if (!eventRaw) return null;
    const ev = eventRaw.get ? eventRaw.get({ plain: true }) : eventRaw;
    const priceRow = ev.productVariantId
      ? await productVariantRepo.getDefaultPrice(ev.productVariantId)
      : null;
    return { ...ev, priceRow: priceRow ? priceRow.get({ plain: true }) : null };
  },

  /**
   * All events for a product with details (variant, meeting, registrations).
   * Enriches each event with its default price row. Used by admin events page.
   */
  async findByProductIdForAdmin(productId) {
    const events = await eventRepo.findByProductIdWithDetails(productId);
    return await Promise.all(
      (events || []).map(async (eventRaw) => {
        const ev = eventRaw.get ? eventRaw.get({ plain: true }) : eventRaw;
        const priceRow = ev.productVariantId
          ? await productVariantRepo.getDefaultPrice(ev.productVariantId)
          : null;
        return { ...ev, priceRow: priceRow ? priceRow.get({ plain: true }) : null };
      })
    );
  },

  /**
   * Single event with its ProductVariant. Used by web register form for seat check.
   */
  async findByIdWithVariant(eventId) {
    return await eventRepo.findByIdWithVariant(eventId);
  },

  /**
   * Active events for a product with ProductVariant. Used by public show page.
   */
  async findActiveByProductIdWithVariant(productId) {
    return await eventRepo.findActiveByProductIdWithVariant(productId);
  },

  /**
   * Get the variant record for an event. Used by web place-order for sold-out check.
   */
  async getVariantForEvent(event) {
    if (!event || !event.productVariantId) return null;
    return await productVariantRepo.findById(event.productVariantId);
  },

  /**
   * Get the default price row for an event's variant. Used by web register/place-order.
   */
  async getPriceForEvent(event) {
    if (!event || !event.productVariantId) return null;
    return await productVariantRepo.getDefaultPrice(event.productVariantId);
  },

  /**
   * Handle a Zoom meeting.deleted webhook: mark the linked event as orphaned
   * and remove the stale EventMeeting record so the dead join URL is no longer served.
   * @param {string} zoomMeetingId
   * @returns {Promise<{ handled: boolean, eventId?: string }>}
   */
  async handleZoomMeetingDeleted(zoomMeetingId) {
    const meetingRow = await eventMeetingRepo.findByZoomMeetingId(zoomMeetingId);
    if (!meetingRow) return { handled: false };
    const eventId = meetingRow.eventId;
    await eventRepo.update(eventId, { eventStatus: "orphaned" });
    await eventMeetingRepo.destroyByEventId(eventId);
    return { handled: true, eventId };
  },

  /**
   * All upcoming events (startDate >= today) across all products, for the admin events overview.
   * Returns plain objects with registrationCount attached.
   */
  async findUpcomingForAdmin() {
    const rows = await eventRepo.findUpcomingWithDetails();
    const events = (rows || []).map((row) => {
      const ev = row.get ? row.get({ plain: true }) : row;
      ev.registrationCount = 0;
      return ev;
    });
    const countByEventId = await registrationRepo.countPaidByEventIds(events.map((ev) => ev.id));
    for (const ev of events) {
      ev.registrationCount = countByEventId.get(String(ev.id)) || 0;
    }
    return events;
  },

  /**
   * All past events (startDate < today) across all products, for the admin events overview.
   * Returns plain objects with registrationCount attached.
   */
  async findPastForAdmin() {
    const rows = await eventRepo.findPastWithDetails();
    const events = (rows || []).map((row) => {
      const ev = row.get ? row.get({ plain: true }) : row;
      ev.registrationCount = 0;
      return ev;
    });
    const countByEventId = await registrationRepo.countPaidByEventIds(events.map((ev) => ev.id));
    for (const ev of events) {
      ev.registrationCount = countByEventId.get(String(ev.id)) || 0;
    }
    return events;
  },

  async findByProductId(productId, options = {}) {
    return await eventRepo.findByProductId(productId, options);
  },

  /**
   * Active events only (for storefront). Excludes cancelled and orphaned.
   */
  async findActiveByProductId(productId, options = {}) {
    return await eventRepo.findActiveByProductId(productId, options);
  },

  async create(productId, data, options = {}) {
    const defaultVariant = await productRepo.getDefaultVariantWithPrice(productId, options);
    if (!defaultVariant) throw new Error("Product has no default variant.");
    const priceRow = defaultVariant.ProductPrices && defaultVariant.ProductPrices[0];
    const amount = priceRow ? Number(priceRow.amount) || 0 : 0;
    const currency = DEFAULT_CURRENCY;

    const { startDate, startTime, durationMinutes, location, capacity, isOnline, timezone } = data;
    if (!startDate || String(startDate).trim() === "") {
      throw new Error("Event start date is required.");
    }
    const capacityNum = capacity != null && capacity !== "" ? Math.max(0, parseInt(capacity, 10) || 0) : 0;

    const t = options.transaction || (await sequelize.transaction());
    const ownTransaction = !options.transaction;
    try {
      const variantTitle = formatEventVariantTitle(startDate, startTime);
      const variant = await productRepo.createVariantWithDefaultPrice(
        productId,
        { title: variantTitle, amount, currency, quantity: capacityNum },
        { ...options, transaction: t }
      );
      const event = await eventRepo.create(
        {
          productId,
          productVariantId: variant.id,
          startDate: startDate || null,
          startTime: startTime || null,
          durationMinutes: durationMinutes != null && durationMinutes !== "" ? parseInt(durationMinutes, 10) : null,
          location: location ? String(location).trim() : null,
          capacity: capacityNum || null,
          isOnline: !!isOnline,
          timezone: timezone ? String(timezone).trim() || null : null,
        },
        { ...options, transaction: t }
      );
      if (ownTransaction) await t.commit();
      return await eventRepo.findById(event.id, { ...options, transaction: ownTransaction ? undefined : t });
    } catch (e) {
      if (ownTransaction) await t.rollback();
      throw e;
    }
  },

  async update(id, data, options = {}) {
    const { startDate, startTime, durationMinutes, location, capacity, isOnline, timezone, priceAmount, currency } = data;
    const payload = {};
    if (startDate !== undefined) payload.startDate = startDate || null;
    if (startTime !== undefined) payload.startTime = startTime || null;
    if (durationMinutes !== undefined) payload.durationMinutes = durationMinutes != null && durationMinutes !== "" ? parseInt(durationMinutes, 10) : null;
    if (location !== undefined) payload.location = location ? String(location).trim() : null;
    if (capacity !== undefined) payload.capacity = capacity != null && capacity !== "" ? parseInt(capacity, 10) : null;
    if (isOnline !== undefined) payload.isOnline = !!isOnline;
    if (timezone !== undefined) payload.timezone = timezone ? String(timezone).trim() || null : null;
    await eventRepo.update(id, payload, options);

    const event = await eventRepo.findById(id, options);
    if (event && event.productVariantId && (priceAmount !== undefined || currency !== undefined)) {
      const updatePrice = {};
      if (priceAmount !== undefined && priceAmount !== "") updatePrice.amount = Number(priceAmount);
      // ignore any incoming currency; price must always use DEFAULT_CURRENCY
      updatePrice.currency = DEFAULT_CURRENCY.substring(0, 3);
      if (Object.keys(updatePrice).length) {
        await productVariantRepo.updateDefaultPrice(event.productVariantId, updatePrice, options);
      }
    }
    if (event && event.productVariantId && capacity !== undefined) {
      const q = capacity != null && capacity !== "" ? Math.max(0, parseInt(capacity, 10) || 0) : 0;
      await productVariantRepo.update(event.productVariantId, { quantity: q }, options);
    }
    return await eventRepo.findById(id, options);
  },

  /**
   * Bulk save: process deletes, then updates, then creates for a product's events.
   * @param {string} productId - Product UUID
   * @param {{ events: Array<object>, deletedIds?: string[] }} payload - events array (each: id? for update, or no id for create); deletedIds = event ids to delete
   * @param {object} options - Sequelize options
   */
  async saveEventsForProduct(productId, payload, options = {}) {
    const events = Array.isArray(payload.events) ? payload.events : [];
    const deletedIds = Array.isArray(payload.deletedIds) ? payload.deletedIds : [];

    const t = options.transaction || (await sequelize.transaction());
    const ownTransaction = !options.transaction;
    const opts = { ...options, transaction: t };

    try {
      for (const id of deletedIds) {
        if (!id) continue;
        const result = await this.delete(id, opts);
        if (!result.deleted && result.error) throw new Error(result.error);
      }

      for (const row of events) {
        const hasId = row.id && String(row.id).trim();
        if (hasId) {
          const validation = require("../validators/event.schema").validateEventForm(row);
          if (!validation.ok) throw new Error(validation.errors?.[0]?.message || "Validation failed.");
          await this.update(row.id, validation.data, opts);
        } else {
          if (!row.startDate || String(row.startDate).trim() === "") continue;
          const validation = require("../validators/event.schema").validateEventForm(row);
          if (!validation.ok) throw new Error(validation.errors?.[0]?.message || "Validation failed.");
          await this.create(productId, validation.data, opts);
        }
      }

      if (ownTransaction) await t.commit();
    } catch (e) {
      if (ownTransaction) await t.rollback();
      throw e;
    }
  },

  /**
   * Ensure an online event has a meeting (e.g. Zoom). Idempotent: no-op if meeting exists.
   * Skips if event is not active (cancelled/orphaned) unless skipStatusCheck is true (e.g. for re-sync).
   * @param {string} eventId
   * @param {string} userId - Admin user id (must have connected meeting provider in settings)
   * @param {{ skipStatusCheck?: boolean } & object} options
   * @returns {Promise<{ created: boolean, error?: string }>}
   */
  async ensureMeetingForOnlineEvent(eventId, userId, options = {}) {
    const event = await eventRepo.findById(eventId, options);
    if (!event || !event.isOnline) return { created: false };
    if (!options.skipStatusCheck && event.eventStatus !== "active") return { created: false };

    const existing = await eventMeetingRepo.findByEventId(eventId, options);
    if (existing) return { created: false };

    const provider = getMeetingProvider();
    if (!provider) return { created: false, error: "Meeting provider not configured." };

    try {
      const plain = event.get ? event.get({ plain: true }) : event;
      const product = await productRepo.findById(event.productId, options);
      const productPlain = product && typeof product.get === "function" ? product.get({ plain: true }) : product;
      plain.productTitle = (productPlain && productPlain.title) ? String(productPlain.title).trim() : "Event";
      const result = await provider.createMeeting(plain, userId);
      await eventMeetingRepo.create(
        {
          eventId,
          zoomMeetingId: result.zoomMeetingId,
          zoomHostAccountId: result.zoomHostAccountId ?? null,
        },
        options
      );
      return { created: true };
    } catch (e) {
      return { created: false, error: e.message || "Failed to create meeting." };
    }
  },

  /**
   * Sync this product's active online events with Zoom (create meetings for those without one).
   * @param {string} productId
   * @param {string} userId - Admin user id
   * @returns {Promise<{ created: number, errors: string[] }>}
   */
  async syncProductEvents(productId, userId) {
    const events = await eventRepo.findActiveOnlineByProductIdWithMeeting(productId);
    const toSync = (events || []).filter((e) => !e.EventMeeting || !e.EventMeeting.zoomMeetingId);
    let created = 0;
    const errors = [];
    for (const ev of toSync) {
      const result = await this.ensureMeetingForOnlineEvent(ev.id, userId);
      if (result.created) created++;
      else if (result.error) errors.push(result.error);
    }
    return { created, errors };
  },

  /**
   * Sync all active online events across all products (e.g. after Connect Zoom).
   * @param {string} userId - Admin user id
   * @returns {Promise<{ created: number, errors: string[] }>}
   */
  async syncAllEvents(userId) {
    const events = await eventRepo.findActiveOnlineWithMeetings();
    const toSync = (events || []).filter((e) => !e.EventMeeting || !e.EventMeeting.zoomMeetingId);
    let created = 0;
    const errors = [];
    for (const ev of toSync) {
      const result = await this.ensureMeetingForOnlineEvent(ev.id, userId);
      if (result.created) created++;
      else if (result.error) errors.push(result.error);
    }
    return { created, errors };
  },

  /**
   * Flow 1 — Cancel event: remove Zoom registrants, delete the Zoom meeting, then mark as cancelled.
   * Works for both active and orphaned events. No registration, order, or refund changes.
   * Zoom errors are propagated to the caller — event is only marked cancelled after full Zoom success.
   * 404 responses from Zoom are treated as success (idempotent retries).
   * @param {string} eventId
   * @returns {Promise<{ cancelled: boolean, error?: string }>}
   */
  async cancelEvent(eventId) {
    const event = await eventRepo.findByIdWithRegistrationsAndMeeting(eventId);
    if (!event) return { cancelled: false, error: "Event not found." };
    if (event.eventStatus !== "active" && event.eventStatus !== "orphaned") {
      return { cancelled: false, error: "Only active or orphaned events can be cancelled." };
    }

    const registrations = event.Registrations || [];
    const meeting = event.EventMeeting;
    const provider = getMeetingProvider();

    if (provider && meeting && meeting.zoomMeetingId) {
      const meetingPlain = meeting.get ? meeting.get({ plain: true }) : meeting;
      for (const reg of registrations) {
        if (reg.zoomRegistrantId) {
          await provider.removeRegistrant(meetingPlain, reg.zoomRegistrantId);
        }
      }
      await provider.deleteMeeting(meetingPlain);
      await eventMeetingRepo.destroyByEventId(eventId);
    }

    if (event.productVariantId) {
      await productVariantRepo.update(event.productVariantId, { active: false });
      await cartRepo.removeLinesByVariantId(event.productVariantId);
      logger.info("cancelEvent: variant deactivated and cart lines removed", { eventId, variantId: event.productVariantId });
    }

    await eventRepo.update(eventId, { eventStatus: "cancelled" });
    return { cancelled: true };
  },

  /**
   * Flow 2 — Process refunds and clean up registrations for a cancelled event.
   * Only runs when event is cancelled. Processes remaining (non-soft-deleted) registrations.
   * Refunds each paid order at most once: only seats for this event (partial refund + LINE_QUANTITY), not the full order.
   * Then voids pending orders per registration and soft-deletes each registration.
   * Idempotent: re-running picks up only unprocessed registrations.
   * @param {string} eventId
   * @returns {Promise<{ ok: boolean, processed: number, total: number, error?: string }>}
   */
  async processEventRefundsAndCleanup(eventId) {
    const { PAYMENT_STATUS, FULFILLMENT_STATUS } = require("../constants/order");
    const event = await eventRepo.findByIdWithRegistrationsAndMeeting(eventId);
    if (!event) return { ok: false, processed: 0, total: 0, error: "Event not found." };
    if (event.eventStatus !== "cancelled") {
      return { ok: false, processed: 0, total: 0, error: "Event is not cancelled." };
    }

    const registrations = event.Registrations || [];
    const total = registrations.length;
    if (total === 0) return { ok: true, processed: 0, total: 0 };

    const orderIdsForRefund = [...new Set(registrations.map((r) => r.orderId).filter(Boolean))];
    for (const oid of orderIdsForRefund) {
      const order = await orderRepo.findById(oid);
      if (order && orderService.isPaymentStatusRefundable(order.paymentStatus)) {
        const remaining = await orderService.getRemainingRefundableAmount(order.id);
        if (remaining !== null && remaining > 0.0001) {
          const result = await orderService.refundCancelledEventPortionForOrder(order.id, eventId);
          if (!result.refunded) {
            return { ok: false, processed: 0, total, error: result.error || "Stripe refund failed." };
          }
          const afterRemaining = await orderService.getRemainingRefundableAmount(order.id);
          if (afterRemaining !== null && afterRemaining <= 0.0001) {
            const pendingRefundRequest = await refundRequestRepo.findPendingByOrder(order.id);
            if (pendingRefundRequest) {
              await refundRequestRepo.update(pendingRefundRequest.id, {
                status: REFUND_REQUEST_STATUS.APPROVED,
                processedAt: new Date(),
                processedByUserId: null,
              });
              logger.info("processEventRefundsAndCleanup: auto-approved refund request after order fully refunded", {
                orderId: order.id,
                refundRequestId: pendingRefundRequest.id,
              });
            }
          }
        }
      }
    }

    let processed = 0;
    for (const reg of registrations) {
      const order = reg.orderId ? await orderRepo.findById(reg.orderId) : null;

      if (order && order.paymentStatus === PAYMENT_STATUS.PENDING) {
        await sequelize.transaction(async (t) => {
          await orderRepo.update(order.id, {
            paymentStatus: PAYMENT_STATUS.VOIDED,
            fulfillmentStatus: FULFILLMENT_STATUS.CANCELLED,
          }, { transaction: t });
          await registrationRepo.destroy(reg.id, { transaction: t });
        });
        logger.info("processEventRefundsAndCleanup: registration soft-deleted", { registrationId: reg.id, orderId: reg.orderId });
        processed++;
        continue;
      }
      // Already refunded/voided or no order — proceed to soft-delete

      await registrationRepo.destroy(reg.id);
      logger.info("processEventRefundsAndCleanup: registration soft-deleted", { registrationId: reg.id, orderId: reg.orderId });
      processed++;
    }

    logger.info("processEventRefundsAndCleanup: complete", { eventId, processed, total });
    return { ok: true, processed, total };
  },

  /**
   * Re-sync an orphaned event: create new Zoom meeting and add all existing registrants.
   * @param {string} eventId
   * @param {string} userId - Admin user id
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  async resyncOrphanedEvent(eventId, userId) {
    const event = await eventRepo.findByIdWithRegistrationsAndMeeting(eventId);
    if (!event) return { ok: false, error: "Event not found." };
    if (event.eventStatus !== "orphaned") return { ok: false, error: "Event is not orphaned." };
    if (!event.isOnline) return { ok: false, error: "Event is not online." };

    const oldMeeting = event.EventMeeting;
    if (oldMeeting) {
      await eventMeetingRepo.destroyByEventId(eventId);
    }
    await eventRepo.update(eventId, { eventStatus: "active" });

    const result = await this.ensureMeetingForOnlineEvent(eventId, userId, { skipStatusCheck: true });
    if (!result.created) {
      // Roll back to orphaned so the admin can see it still needs attention
      await eventRepo.update(eventId, { eventStatus: "orphaned" });
      return { ok: false, error: result.error || "Could not create meeting." };
    }

    const provider = getMeetingProvider();
    const newMeetingRow = await eventMeetingRepo.findByEventId(eventId);
    const registrations = event.Registrations || [];
    if (provider && newMeetingRow) {
      const meetingPlain = newMeetingRow.get ? newMeetingRow.get({ plain: true }) : newMeetingRow;
      for (const reg of registrations) {
        try {
          const regPlain = reg.get ? reg.get({ plain: true }) : reg;
          const { zoomRegistrantId } = await provider.addRegistrant(meetingPlain, regPlain);
          // Persist the new registrant ID so future cancellations can remove the registrant
          if (zoomRegistrantId) {
            await registrationRepo.update(reg.id, { zoomRegistrantId });
          }
        } catch (_) {}
      }
    }
    return { ok: true };
  },

  /**
   * Delete event and its variant+price only if the variant has no order lines.
   * Removes EventMeeting and Registration (children) before deleting the event.
   * If the event is online and has a Zoom meeting, deletes the meeting on Zoom first.
   */
  async delete(id, options = {}) {
    const event = await eventRepo.findById(id, options);
    if (!event) return { deleted: false, error: "Event not found." };
    const eventPlain = event.get ? event.get({ plain: true }) : event;
    if (eventPlain.eventStatus !== "cancelled") {
      return { deleted: false, error: "Only cancelled events can be removed." };
    }
    const variantId = eventPlain.productVariantId;

    const deleteZoomMeetingIfPresent = async (opts) => {
      const meetingRow = await eventMeetingRepo.findByEventId(id, opts);
      if (!meetingRow || !eventPlain.isOnline) return;
      const meeting = meetingRow.get ? meetingRow.get({ plain: true }) : meetingRow;
      if (!meeting.zoomMeetingId) return;
      const provider = getMeetingProvider();
      if (provider && typeof provider.deleteMeeting === "function") {
        try {
          await provider.deleteMeeting(meeting);
        } catch (_) {
          // Best-effort during hard delete — do not block event removal
        }
      }
    };

    if (!variantId) {
      const orderLineCount = await orderLineRepo.countByEventId(id, options);
      if (orderLineCount > 0) {
        return { deleted: false, error: "Cannot delete event: it has been ordered. Remove or archive orders first." };
      }
      const t = options.transaction || (await sequelize.transaction());
      const ownTransaction = !options.transaction;
      const opts = { ...options, transaction: t };
      try {
        await deleteZoomMeetingIfPresent(opts);
        await eventMeetingRepo.destroyByEventId(id, opts);
        await registrationRepo.destroyAllByEventId(id, opts);
        await eventRepo.delete(id, opts);
        if (ownTransaction) await t.commit();
        return { deleted: true };
      } catch (e) {
        if (ownTransaction) await t.rollback();
        throw e;
      }
    }
    const [countByVariant, countByEvent] = await Promise.all([
      orderLineRepo.countByProductVariantIds([variantId], options),
      orderLineRepo.countByEventId(id, options),
    ]);
    if (countByVariant > 0 || countByEvent > 0) {
      return { deleted: false, error: "Cannot delete event: it has been ordered. Remove or archive orders first." };
    }
    const t = options.transaction || (await sequelize.transaction());
    const ownTransaction = !options.transaction;
    const opts = { ...options, transaction: t };
    try {
      await deleteZoomMeetingIfPresent(opts);
      await eventMeetingRepo.destroyByEventId(id, opts);
      await registrationRepo.destroyAllByEventId(id, opts);
      await productVariantRepo.destroyPrices(variantId, opts);
      await eventRepo.delete(id, opts);
      await productVariantRepo.destroy(variantId, opts);
      if (ownTransaction) await t.commit();
      return { deleted: true };
    } catch (e) {
      if (ownTransaction) await t.rollback();
      throw e;
    }
  },
};
