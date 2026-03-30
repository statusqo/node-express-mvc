const registrationRepo = require("../repos/registration.repo");
const eventRepo = require("../repos/event.repo");
const eventMeetingRepo = require("../repos/eventMeeting.repo");
const orderRepo = require("../repos/order.repo");
const orderService = require("./order.service");
const logger = require("../config/logger");
const { getMeetingProvider } = require("../gateways/meeting.interface");
const { PAYMENT_STATUS } = require("../constants/order");

module.exports = {
  /**
   * All registrations for an event, enriched with Order and User details.
   * Returns plain objects. Used by the admin registrants page.
   * @param {string} eventId
   * @returns {Promise<Array>}
   */
  async findRegistrantsForEvent(eventId) {
    const rows = await registrationRepo.findAllByEventIdWithDetails(eventId);
    return (rows || []).map((row) => (row.get ? row.get({ plain: true }) : row));
  },

  /**
   * Cancel a single registration from an event (admin action).
   * Order of operations:
   *   1. Validate registration belongs to the given event.
   *   2. Remove from Zoom (non-fatal for 404; non-404 aborts the flow).
   *   3. Issue Stripe refund / void for paid orders; cancel pending orders.
   *   4. Soft-delete the registration.
   * @param {string} registrationId
   * @param {string} eventId
   * @returns {Promise<{ cancelled: boolean, error?: string }>}
   */
  async cancelRegistration(registrationId, eventId) {
    const registration = await registrationRepo.findByIdWithOrder(registrationId);
    if (!registration) {
      return { cancelled: false, error: "Registration not found." };
    }
    if (String(registration.eventId) !== String(eventId)) {
      return { cancelled: false, error: "Registration does not belong to this event." };
    }

    // Step 1: Remove from Zoom BEFORE any financial operations.
    // Non-404 errors abort the flow — customer must not be refunded while still having Zoom access.
    if (!registration.zoomRegistrantId) {
      logger.info("cancelRegistration: no Zoom registrant ID on registration — skipping Zoom removal", { registrationId });
    } else {
      try {
        const meeting = await eventMeetingRepo.findByEventId(eventId);
        if (meeting) {
          const provider = getMeetingProvider();
          if (provider) {
            const meetingPlain = meeting.get ? meeting.get({ plain: true }) : meeting;
            await provider.removeRegistrant(meetingPlain, registration.zoomRegistrantId);
            logger.info("cancelRegistration: Zoom registrant removed", {
              registrationId,
              zoomRegistrantId: registration.zoomRegistrantId,
            });
          }
        }
      } catch (zoomErr) {
        if (zoomErr.status === 404 || zoomErr.statusCode === 404) {
          logger.warn("cancelRegistration: Zoom registrant not found (already removed)", {
            registrationId,
            zoomRegistrantId: registration.zoomRegistrantId,
          });
        } else {
          logger.warn("cancelRegistration: Zoom removal failed — aborting", {
            registrationId,
            error: zoomErr.message,
          });
          throw new Error(`Zoom error: ${zoomErr.message}. Cancellation aborted — please retry.`);
        }
      }
    }

    // Step 2: Handle the associated order.
    const order = registration.Order;
    if (order) {
      if (order.paymentStatus === PAYMENT_STATUS.PAID) {
        // refundOrderForEventCancellation handles:
        //   - paid orders with stripePaymentIntentId → Stripe refund + transaction update + seat restore
        //   - paid orders without PI (free €0 invoice) → just mark refunded + seat restore
        const result = await orderService.refundOrderForEventCancellation(order.id);
        if (!result.refunded) {
          throw new Error(result.error || "Could not refund order.");
        }
        logger.info("cancelRegistration: order refunded", { registrationId, orderId: order.id });
      } else if (order.paymentStatus === PAYMENT_STATUS.PENDING) {
        await orderRepo.update(order.id, { paymentStatus: "cancelled", fulfillmentStatus: "cancelled" });
        logger.info("cancelRegistration: pending order cancelled", { registrationId, orderId: order.id });
      }
      // Already refunded/cancelled — proceed without further financial action.
    }

    // Step 3: Soft-delete the registration.
    await registrationRepo.destroy(registrationId);
    logger.info("cancelRegistration: registration soft-deleted", { registrationId, eventId });
    return { cancelled: true };
  },
};
