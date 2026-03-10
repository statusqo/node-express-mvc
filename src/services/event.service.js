/**
 * Event service - business logic for live sessions (each event = one ProductVariant + ProductPrice).
 * Price for new session variant is copied from product's default variant (blueprint).
 */
const { sequelize } = require("../db");
const { ProductPrice, ProductVariant, EventMeeting, Registration } = require("../models");
const { DEFAULT_CURRENCY } = require("../config/constants");
const productRepo = require("../repos/product.repo");
const eventRepo = require("../repos/event.repo");
const orderLineRepo = require("../repos/orderLine.repo");
const orderRepo = require("../repos/order.repo");
const { getMeetingProvider } = require("../gateways/meeting.interface");
const orderService = require("./order.service");
const emailService = require("./email.service");

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

    const event = await eventRepo.findById(id, { ...options, include: [{ model: ProductVariant, as: "ProductVariant" }] });
    if (event && event.productVariantId && (priceAmount !== undefined || currency !== undefined)) {
      const price = await ProductPrice.findOne({ where: { productVariantId: event.productVariantId, isDefault: true }, ...options });
      if (price) {
        const updatePrice = {};
        if (priceAmount !== undefined && priceAmount !== "") updatePrice.amount = Number(priceAmount);
        // ignore any incoming currency; price must always use DEFAULT_CURRENCY
        updatePrice.currency = DEFAULT_CURRENCY.substring(0, 3);
        if (Object.keys(updatePrice).length) await price.update(updatePrice, options);
      }
    }
    if (event && event.productVariantId && capacity !== undefined) {
      const variant = await ProductVariant.findByPk(event.productVariantId, options);
      if (variant) {
        const q = capacity != null && capacity !== "" ? Math.max(0, parseInt(capacity, 10) || 0) : 0;
        await variant.update({ quantity: q }, options);
      }
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

    const existing = await EventMeeting.findOne({ where: { eventId }, ...options });
    if (existing) return { created: false };

    const provider = getMeetingProvider();
    if (!provider) return { created: false, error: "Meeting provider not configured." };

    try {
      const plain = event.get ? event.get({ plain: true }) : event;
      const product = await productRepo.findById(event.productId, options);
      const productPlain = product && typeof product.get === "function" ? product.get({ plain: true }) : product;
      plain.productTitle = (productPlain && productPlain.title) ? String(productPlain.title).trim() : "Event";
      const result = await provider.createMeeting(plain, userId);
      await EventMeeting.create(
        {
          eventId,
          provider: result.provider || "zoom",
          providerMeetingId: result.providerMeetingId,
          joinUrl: result.joinUrl,
          startUrl: result.startUrl || null,
          hostAccountId: result.hostAccountId ?? null,
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
    const events = await eventRepo.findByProductId(productId, {
      where: { eventStatus: "active", isOnline: true },
      include: [{ model: EventMeeting, as: "EventMeeting", required: false }],
    });
    const toSync = (events || []).filter((e) => !e.EventMeeting || !e.EventMeeting.providerMeetingId);
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
    const { Event } = require("../models");
    const { EVENT_STATUS } = require("../constants/event");
    const events = await Event.findAll({
      where: { eventStatus: EVENT_STATUS.ACTIVE, isOnline: true },
      include: [{ model: EventMeeting, as: "EventMeeting", required: false }],
    });
    const toSync = (events || []).filter((e) => !e.EventMeeting || !e.EventMeeting.providerMeetingId);
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
   * Cancel event: remove registrants from Zoom, delete the Zoom meeting, refund orders, notify users, destroy registrations, then set eventStatus to "cancelled".
   * The event record is always preserved so order history remains intact. Admins can hard-delete cancelled events (with no orders) via the Remove action.
   * @param {string} eventId
   * @returns {Promise<{ cancelled: boolean, error?: string }>}
   */
  async cancelEventAndCleanup(eventId) {
    const event = await eventRepo.findById(eventId, {
      include: [
        { model: EventMeeting, as: "EventMeeting", required: false },
        { model: Registration, as: "Registrations", required: false },
      ],
    });
    if (!event) return { cancelled: false, error: "Event not found." };
    const registrations = event.Registrations || [];
    const meeting = event.EventMeeting;
    const provider = getMeetingProvider();

    if (provider && meeting && meeting.providerMeetingId) {
      for (const reg of registrations) {
        if (reg.providerRegistrantId) {
          try {
            await provider.removeRegistrant(meeting.get ? meeting.get({ plain: true }) : meeting, reg.providerRegistrantId);
          } catch (_) {}
        }
      }
      try {
        await provider.deleteMeeting(meeting.get ? meeting.get({ plain: true }) : meeting);
      } catch (_) {}
    }

    const orderIds = [...new Set(registrations.map((r) => r.orderId).filter(Boolean))];
    const eventPlain = event.get ? event.get({ plain: true }) : event;
    const eventTitle = eventPlain.title || `Event ${eventPlain.startDate || ""} ${eventPlain.startTime != null ? String(eventPlain.startTime).substring(0, 5) : ""}`.trim() || "Event";

    const refundErrors = [];
    for (const orderId of orderIds) {
      const result = await orderService.refundOrderForEventCancellation(orderId);
      if (result.refunded) {
        const order = await orderRepo.findById(orderId);
        if (order && order.email && emailService.sendEventCancellationEmail) {
          try {
            await emailService.sendEventCancellationEmail({
              to: order.email,
              eventTitle,
              startDate: eventPlain.startDate,
              startTime: eventPlain.startTime,
            });
          } catch (_) {}
        }
      } else if (result.error === "Order is not paid.") {
        // Void unpaid/pending orders so they cannot be completed after cancellation.
        const order = await orderRepo.findById(orderId);
        await orderRepo.update(orderId, { paymentStatus: "cancelled", fulfillmentStatus: "cancelled" });
        if (order && order.email && emailService.sendEventCancellationEmail) {
          try {
            await emailService.sendEventCancellationEmail({
              to: order.email,
              eventTitle,
              startDate: eventPlain.startDate,
              startTime: eventPlain.startTime,
              wasRefunded: false,
            });
          } catch (_) {}
        }
      } else if (result.error) {
        refundErrors.push(result.error);
      }
    }

    await Registration.destroy({ where: { eventId } });

    if (meeting) {
      await EventMeeting.destroy({ where: { id: meeting.id } });
    }

    await eventRepo.update(eventId, { eventStatus: "cancelled" });
    return { cancelled: true, refundErrors };
  },

  /**
   * Re-sync an orphaned event: create new Zoom meeting and add all existing registrants.
   * @param {string} eventId
   * @param {string} userId - Admin user id
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  async resyncOrphanedEvent(eventId, userId) {
    const event = await eventRepo.findById(eventId, {
      include: [
        { model: EventMeeting, as: "EventMeeting", required: false },
        { model: Registration, as: "Registrations", required: false },
      ],
    });
    if (!event) return { ok: false, error: "Event not found." };
    if (event.eventStatus !== "orphaned") return { ok: false, error: "Event is not orphaned." };
    if (!event.isOnline) return { ok: false, error: "Event is not online." };

    const oldMeeting = event.EventMeeting;
    if (oldMeeting) {
      await EventMeeting.destroy({ where: { id: oldMeeting.id } });
    }
    await eventRepo.update(eventId, { eventStatus: "active" });

    const result = await this.ensureMeetingForOnlineEvent(eventId, userId, { skipStatusCheck: true });
    if (!result.created) {
      // Roll back to orphaned so the admin can see it still needs attention
      await eventRepo.update(eventId, { eventStatus: "orphaned" });
      return { ok: false, error: result.error || "Could not create meeting." };
    }

    const provider = getMeetingProvider();
    const newMeetingRow = await EventMeeting.findOne({ where: { eventId } });
    const registrations = event.Registrations || [];
    if (provider && newMeetingRow) {
      const meetingPlain = newMeetingRow.get ? newMeetingRow.get({ plain: true }) : newMeetingRow;
      for (const reg of registrations) {
        try {
          const regPlain = reg.get ? reg.get({ plain: true }) : reg;
          const { providerRegistrantId } = await provider.addRegistrant(meetingPlain, regPlain);
          // Persist the new registrant ID so future cancellations can remove the registrant
          if (providerRegistrantId) {
            await reg.update({ providerRegistrantId });
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
      const meetingRow = await EventMeeting.findOne({ where: { eventId: id }, ...opts });
      if (!meetingRow || !eventPlain.isOnline) return;
      const meeting = meetingRow.get ? meetingRow.get({ plain: true }) : meetingRow;
      if (!meeting.providerMeetingId) return;
      const provider = getMeetingProvider();
      if (provider && typeof provider.deleteMeeting === "function") {
        await provider.deleteMeeting(meeting);
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
        await EventMeeting.destroy({ where: { eventId: id }, ...opts });
        await Registration.destroy({ where: { eventId: id }, ...opts });
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
      await EventMeeting.destroy({ where: { eventId: id }, ...opts });
      await Registration.destroy({ where: { eventId: id }, ...opts });
      await ProductPrice.destroy({ where: { productVariantId: variantId }, ...opts });
      await eventRepo.delete(id, opts);
      await ProductVariant.destroy({ where: { id: variantId }, ...opts });
      if (ownTransaction) await t.commit();
      return { deleted: true };
    } catch (e) {
      if (ownTransaction) await t.rollback();
      throw e;
    }
  },
};
