const { sequelize } = require("../db");
const registrationRepo = require("../repos/registration.repo");
const orderAttendeeRepo = require("../repos/orderAttendee.repo");
const eventService = require("./event.service");
const eventMeetingRepo = require("../repos/eventMeeting.repo");
const orderRepo = require("../repos/order.repo");
const orderLineRepo = require("../repos/orderLine.repo");
const orderDiscountRepo = require("../repos/orderDiscount.repo");
const refundTransactionRepo = require("../repos/refundTransaction.repo");
const orderService = require("./order.service");
const stripeGateway = require("../gateways/stripe.gateway");
const logger = require("../config/logger");
const { getMeetingProvider } = require("../gateways/meeting.interface");
const { PAYMENT_STATUS, FULFILLMENT_STATUS } = require("../constants/order");
const { TRANSACTION_STATUS } = require("../constants/transaction");
const { REFUND_TRANSACTION_SCOPE, REFUND_TRANSACTION_STATUS } = require("../constants/refundTransaction");
const orderHistoryService = require("./orderHistory.service");
const { ORDER_HISTORY_EVENT } = require("../constants/orderHistory");

const MONEY_EPS = 0.0001;

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
   * Count event registrants whose orders are paid or partially refunded.
   * @param {string} eventId
   * @returns {Promise<number>}
   */
  async countPaidRegistrantsForEvent(eventId) {
    return await registrationRepo.countPaidByEventId(eventId);
  },

  /**
   * Admin registrant edit: registration with order, event row, and meeting if any. All plain objects.
   * @returns {Promise<{ registration: object, event: object, meeting: object|null }|null>}
   */
  async getRegistrationForAdminEdit(registrationId, eventId) {
    const registrationRow = await registrationRepo.findByIdWithOrder(registrationId);
    if (!registrationRow) return null;
    if (String(registrationRow.eventId) !== String(eventId)) return null;
    const eventRow = await eventService.findById(eventId);
    if (!eventRow) return null;
    const meetingRow = await eventMeetingRepo.findByEventId(eventId);
    return {
      registration: registrationRow.get ? registrationRow.get({ plain: true }) : registrationRow,
      event: eventRow.get ? eventRow.get({ plain: true }) : eventRow,
      meeting: meetingRow ? (meetingRow.get ? meetingRow.get({ plain: true }) : meetingRow) : null,
    };
  },

  /**
   * Add registrant to Zoom for an existing registration (admin recovery).
   * Idempotent: if zoomRegistrantId already set, returns ok with alreadySynced.
   * @returns {Promise<{ ok: boolean, alreadySynced?: boolean, zoomRegistrantId?: string, error?: string }>}
   */
  async retryZoomSyncForRegistration(registrationId, eventId) {
    const registrationRow = await registrationRepo.findById(registrationId);
    if (!registrationRow) {
      return { ok: false, error: "Registration not found." };
    }
    if (String(registrationRow.eventId) !== String(eventId)) {
      return { ok: false, error: "Registration does not belong to this event." };
    }

    if (registrationRow.zoomRegistrantId) {
      return { ok: true, alreadySynced: true, zoomRegistrantId: registrationRow.zoomRegistrantId };
    }

    const eventRow = await eventService.findById(eventId);
    if (!eventRow || !eventRow.isOnline) {
      return { ok: false, error: "Event is not an online session; Zoom sync does not apply." };
    }

    const meetingRow = await eventMeetingRepo.findByEventId(eventId);
    if (!meetingRow) {
      return { ok: false, error: "No meeting linked to this event. Create or sync the meeting first." };
    }

    const provider = getMeetingProvider();
    if (!provider || typeof provider.addRegistrant !== "function") {
      return { ok: false, error: "Meeting provider is not configured." };
    }

    const regPlain = registrationRow.get ? registrationRow.get({ plain: true }) : registrationRow;
    const meetingPlain = meetingRow.get ? meetingRow.get({ plain: true }) : meetingRow;

    try {
      const { zoomRegistrantId } = await provider.addRegistrant(meetingPlain, regPlain);
      if (!zoomRegistrantId) {
        return { ok: false, error: "Zoom did not return a registrant id." };
      }
      await registrationRepo.update(registrationId, { zoomRegistrantId });
      logger.info("retryZoomSyncForRegistration: Zoom registrant saved", { registrationId, eventId });
      return { ok: true, zoomRegistrantId };
    } catch (err) {
      logger.warn("retryZoomSyncForRegistration failed", { registrationId, eventId, error: err.message });
      return { ok: false, error: err.message || "Zoom sync failed." };
    }
  },

  /**
   * Remove the attendee from Zoom only; clears zoomRegistrantId on the registration.
   * Does not cancel the registration or refund.
   * @returns {Promise<{ ok: boolean, alreadyRemoved?: boolean, error?: string }>}
   */
  async removeZoomFromRegistration(registrationId, eventId) {
    const registrationRow = await registrationRepo.findById(registrationId);
    if (!registrationRow) {
      return { ok: false, error: "Registration not found." };
    }
    if (String(registrationRow.eventId) !== String(eventId)) {
      return { ok: false, error: "Registration does not belong to this event." };
    }

    if (!registrationRow.zoomRegistrantId) {
      return { ok: true, alreadyRemoved: true };
    }

    const eventRow = await eventService.findById(eventId);
    if (!eventRow || !eventRow.isOnline) {
      return { ok: false, error: "Event is not an online session; Zoom does not apply." };
    }

    const meetingRow = await eventMeetingRepo.findByEventId(eventId);
    if (!meetingRow) {
      return { ok: false, error: "No meeting linked to this event." };
    }

    const provider = getMeetingProvider();
    if (!provider || typeof provider.removeRegistrant !== "function") {
      return { ok: false, error: "Meeting provider is not configured." };
    }

    const meetingPlain = meetingRow.get ? meetingRow.get({ plain: true }) : meetingRow;
    const zoomId = registrationRow.zoomRegistrantId;

    try {
      await provider.removeRegistrant(meetingPlain, zoomId);
      logger.info("removeZoomFromRegistration: Zoom registrant removed", { registrationId, eventId, zoomId });
    } catch (zoomErr) {
      if (zoomErr.status === 404 || zoomErr.statusCode === 404) {
        logger.warn("removeZoomFromRegistration: Zoom registrant not found (already removed)", {
          registrationId,
          zoomId,
        });
      } else {
        logger.warn("removeZoomFromRegistration failed", { registrationId, eventId, error: zoomErr.message });
        return { ok: false, error: zoomErr.message || "Could not remove registrant from Zoom." };
      }
    }

    await registrationRepo.update(registrationId, { zoomRegistrantId: null });
    return { ok: true };
  },

  /**
   * Update registrant contact/name on Registration and linked OrderAttendee (admin).
   * Blocked while zoomRegistrantId is set so Zoom stays the source of truth until unlinked.
   * @param {string} registrationId
   * @param {string} eventId
   * @param {{ email: string, forename?: string|null, surname?: string|null }} payload
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  async updateRegistrationForAdmin(registrationId, eventId, payload) {
    const registrationRow = await registrationRepo.findById(registrationId);
    if (!registrationRow) {
      return { ok: false, error: "Registration not found." };
    }
    if (String(registrationRow.eventId) !== String(eventId)) {
      return { ok: false, error: "Registration does not belong to this event." };
    }
    if (registrationRow.zoomRegistrantId) {
      return {
        ok: false,
        error: "Remove the registrant from Zoom before editing these details.",
      };
    }

    const email = String(payload.email || "").trim().toLowerCase();
    const forename = payload.forename ?? null;
    const surname = payload.surname ?? null;

    await sequelize.transaction(async (t) => {
      await registrationRepo.update(registrationId, { email, forename, surname }, { transaction: t });

      if (registrationRow.orderAttendeeId) {
        const attendee = await orderAttendeeRepo.findById(registrationRow.orderAttendeeId);
        if (attendee) {
          await orderAttendeeRepo.update(attendee.id, { email, forename, surname }, { transaction: t });
        }
      }
    });

    logger.info("updateRegistrationForAdmin: registration updated", { registrationId, eventId });
    return { ok: true };
  },

  /**
   * Cancel a single registration from an event (admin action).
   * Order of operations:
   *   1. Validate registration belongs to the given event.
   *   2. Remove from Zoom (non-fatal for 404; non-404 aborts the flow).
   *   3. Issue Stripe refund / void for paid orders; cancel pending orders.
   *   4. Soft-delete the registration (or leave it until refund succeeds if Stripe is pending — webhooks / retry finalize).
   * @param {string} registrationId
   * @param {string} eventId
   * @returns {Promise<{ cancelled: boolean, pending?: boolean, error?: string }>}
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
          if (!provider) {
            throw new Error("Meeting provider is not configured; cannot remove Zoom registrant. Cancellation aborted — please check Zoom configuration and retry.");
          }
          const meetingPlain = meeting.get ? meeting.get({ plain: true }) : meeting;
          await provider.removeRegistrant(meetingPlain, registration.zoomRegistrantId);
          logger.info("cancelRegistration: Zoom registrant removed", {
            registrationId,
            zoomRegistrantId: registration.zoomRegistrantId,
          });
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
    let handledByRefundTransaction = false;
    let refundPending = false;
    if (order) {
      if (orderService.isPaymentStatusRefundable(order.paymentStatus)) {
        if (!order.stripePaymentIntentId) {
          throw new Error("Order has no payment intent; cannot issue a seat refund.");
        }
        if (!stripeGateway.isConfigured()) {
          throw new Error("Stripe is not configured; cannot issue refund.");
        }
        const orderLine = await orderLineRepo.findById(registration.orderLineId);
        if (!orderLine) {
          throw new Error("Order line not found for this registration.");
        }
        const linePrice = Number(orderLine.price) || 0;
        if (linePrice <= 0) {
          throw new Error("Invalid refund amount for this registration.");
        }
        const remainingRefundable = await orderService.getRemainingRefundableAmount(order.id);
        if (remainingRefundable === null || remainingRefundable <= MONEY_EPS) {
          throw new Error("No refundable balance remains for this order.");
        }
        // Apply discount factor so the per-seat refund matches what was actually paid.
        // Without this, a discounted order refunds at gross price, exhausting the budget
        // unevenly and causing the "Process Refunds & Clean Up" flow to fail.
        let effectiveLinePrice = linePrice;
        const orderDiscount = await orderDiscountRepo.findByOrder(order.id);
        if (orderDiscount && Number(orderDiscount.amountDeducted) > MONEY_EPS) {
          const amountDeducted = Number(orderDiscount.amountDeducted);
          const applicableTo = orderDiscount.applicableTo || "all";
          if (applicableTo === "all") {
            const grossTotal = Number(order.total) + amountDeducted;
            if (grossTotal > MONEY_EPS) {
              effectiveLinePrice = Math.round(linePrice * (Number(order.total) / grossTotal) * 100) / 100;
            }
          } else if (applicableTo === "events") {
            const allLines = await orderLineRepo.findByOrder(order.id);
            const grossEventTotal = allLines
              .filter((l) => l.eventId != null)
              .reduce((s, l) => s + (Number(l.price) || 0) * (Number(l.quantity) || 1), 0);
            if (grossEventTotal > MONEY_EPS) {
              const factor = Math.max(0, grossEventTotal - amountDeducted) / grossEventTotal;
              effectiveLinePrice = Math.round(linePrice * factor * 100) / 100;
            }
          }
          // applicableTo === "products": event lines are not discounted — no adjustment.
        }
        const refundAmount = Math.min(effectiveLinePrice, remainingRefundable);
        const transactions = await orderService.getTransactionsForOrder(order.id);
        const successTx = transactions.find(
          (t) => t.gatewayReference === order.stripePaymentIntentId && t.status === TRANSACTION_STATUS.SUCCESS
        );
        let refund;
        try {
          refund = await stripeGateway.createRefund({
            paymentIntentId: order.stripePaymentIntentId,
            amountMinor: Math.round(refundAmount * 100),
            reason: "requested_by_customer",
            metadata: {
              orderId: String(order.id),
              registrationId: String(registration.id),
              scopeType: REFUND_TRANSACTION_SCOPE.EVENT_ATTENDEE,
            },
            idempotencyKey: `registration_refund_${registration.id}`,
          });
        } catch (e) {
          logger.error("cancelRegistration: Stripe refund failed", { registrationId, orderId: order.id, error: e.message });
          throw new Error(e.message || "Stripe refund failed.");
        }

        if (refund.status === "failed" || refund.status === "canceled") {
          throw new Error(
            `Stripe refund status: ${refund.status}. No database changes were recorded — please retry.`,
          );
        }

        const mappedStatus =
          refund.status === "succeeded"
            ? REFUND_TRANSACTION_STATUS.SUCCEEDED
            : refund.status === "failed"
              ? REFUND_TRANSACTION_STATUS.FAILED
              : refund.status === "canceled"
                ? REFUND_TRANSACTION_STATUS.CANCELLED
                : REFUND_TRANSACTION_STATUS.PENDING;
        const refundMeta = JSON.stringify({
          stripeStatus: refund.status,
          zoomRemovedBeforeRefund: true,
        });

        // Record RefundTransaction (pending or succeeded); apply effects only when Stripe succeeded — same pattern as admin cancel & refund / approve refund request.
        await sequelize.transaction(async (t) => {
          let refundTx = await refundTransactionRepo.findByStripeRefundId(refund.id, { transaction: t });
          if (!refundTx) {
            refundTx = await refundTransactionRepo.create({
              orderId: order.id,
              paymentTransactionId: successTx ? successTx.id : null,
              stripeRefundId: refund.id,
              paymentIntentId: order.stripePaymentIntentId,
              amount: refundAmount,
              currency: order.currency,
              status: mappedStatus,
              scopeType: REFUND_TRANSACTION_SCOPE.EVENT_ATTENDEE,
              orderLineId: registration.orderLineId,
              registrationId: registration.id,
              orderAttendeeId: registration.orderAttendeeId || null,
              refundedQuantity: 1,
              reason: "Admin cancelled event registrant",
              metadata: refundMeta,
            }, { transaction: t });
          } else {
            await refundTransactionRepo.update(refundTx.id, { status: mappedStatus, metadata: refundMeta }, { transaction: t });
          }
          if (refund.status === "succeeded") {
            await orderService.applyRefundTransactionEffects(refundTx.id, { transaction: t });
          }
        });

        if (refund.status === "succeeded") {
          handledByRefundTransaction = true;
          logger.info("cancelRegistration: seat refund completed", { registrationId, orderId: order.id, refundId: refund.id });
          const isFullRefund = remainingRefundable != null && Math.abs(refundAmount - remainingRefundable) <= MONEY_EPS;
          const refundEvent = isFullRefund ? ORDER_HISTORY_EVENT.PAYMENT_REFUNDED : ORDER_HISTORY_EVENT.PARTIAL_REFUND_ISSUED;
          orderHistoryService.record(order.id, refundEvent, {
            success: true,
            meta: { registrationId, stripeRefundId: refund.id, amount: refundAmount, currency: order.currency, scopeType: "event_attendee" },
          });
        } else {
          refundPending = true;
          logger.info("cancelRegistration: seat refund pending — registration will complete when Stripe succeeds", {
            registrationId,
            orderId: order.id,
            refundId: refund.id,
          });
          const isFullRefundPending = remainingRefundable != null && Math.abs(refundAmount - remainingRefundable) <= MONEY_EPS;
          const refundEventPending = isFullRefundPending ? ORDER_HISTORY_EVENT.PAYMENT_REFUNDED : ORDER_HISTORY_EVENT.PARTIAL_REFUND_ISSUED;
          orderHistoryService.record(order.id, refundEventPending, {
            success: null,
            meta: { registrationId, stripeRefundId: refund.id, stripeStatus: refund.status, amount: refundAmount, currency: order.currency, scopeType: "event_attendee" },
          });
        }
      } else if (order.paymentStatus === PAYMENT_STATUS.PENDING) {
        await sequelize.transaction(async (t) => {
          await orderRepo.update(order.id, {
            paymentStatus: PAYMENT_STATUS.VOIDED,
            fulfillmentStatus: FULFILLMENT_STATUS.CANCELLED,
          }, { transaction: t });
          await registrationRepo.destroy(registrationId, { transaction: t });
        });
        handledByRefundTransaction = true;
        logger.info("cancelRegistration: pending order voided and registration removed", { registrationId, orderId: order.id });
        orderHistoryService.record(order.id, ORDER_HISTORY_EVENT.ORDER_CANCELLED, {
          success: true,
          meta: { registrationId, reason: "pending_order_voided_on_registration_cancel" },
        });
      }
      // Already refunded/cancelled — proceed without further financial action.
    }

    if (refundPending) {
      return { cancelled: false, pending: true };
    }

    // Step 3: Soft-delete the registration if not already handled by the refund transaction effects.
    if (!handledByRefundTransaction) {
      await registrationRepo.destroy(registrationId);
      logger.info("cancelRegistration: registration soft-deleted", { registrationId, eventId });
    }
    return { cancelled: true };
  },
};
