const registrationRepo = require("../repos/registration.repo");
const eventRepo = require("../repos/event.repo");
const eventMeetingRepo = require("../repos/eventMeeting.repo");
const orderRepo = require("../repos/order.repo");
const orderLineRepo = require("../repos/orderLine.repo");
const refundTransactionRepo = require("../repos/refundTransaction.repo");
const orderService = require("./order.service");
const stripeGateway = require("../gateways/stripe.gateway");
const logger = require("../config/logger");
const { getMeetingProvider } = require("../gateways/meeting.interface");
const { PAYMENT_STATUS, FULFILLMENT_STATUS } = require("../constants/order");
const { TRANSACTION_STATUS } = require("../constants/transaction");
const { REFUND_TRANSACTION_SCOPE, REFUND_TRANSACTION_STATUS } = require("../constants/refundTransaction");

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
    let handledByRefundTransaction = false;
    if (order) {
      if (orderService.isPaymentStatusRefundable(order.paymentStatus)) {
        if (!order.stripePaymentIntentId) {
          throw new Error("Order has no payment intent; cannot issue a seat refund.");
        }
        const orderLine = await orderLineRepo.findById(registration.orderLineId);
        if (!orderLine) {
          throw new Error("Order line not found for this registration.");
        }
        const refundAmount = Number(orderLine.price) || 0;
        if (refundAmount <= 0) {
          throw new Error("Invalid refund amount for this registration.");
        }
        const remainingRefundable = await orderService.getRemainingRefundableAmount(order.id);
        if (remainingRefundable === null || remainingRefundable + MONEY_EPS < refundAmount) {
          throw new Error("Refund amount exceeds remaining refundable balance for this order.");
        }
        const transactions = await orderService.getTransactionsForOrder(order.id);
        const successTx = transactions.find(
          (t) => t.gatewayReference === order.stripePaymentIntentId && t.status === TRANSACTION_STATUS.SUCCESS
        );
        const refund = await stripeGateway.createRefund({
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
        let refundTx = await refundTransactionRepo.findByStripeRefundId(refund.id);
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
          });
        } else {
          await refundTransactionRepo.update(refundTx.id, {
            status: mappedStatus,
            metadata: refundMeta,
          });
        }
        if (refund.status !== "succeeded") {
          throw new Error("Refund is pending. Please retry in a moment.");
        }
        await orderService.applyRefundTransactionEffects(refundTx.id);
        handledByRefundTransaction = true;
        logger.info("cancelRegistration: seat refund completed", { registrationId, orderId: order.id, refundId: refund.id });
      } else if (order.paymentStatus === PAYMENT_STATUS.PENDING) {
        await orderRepo.update(order.id, {
          paymentStatus: PAYMENT_STATUS.VOIDED,
          fulfillmentStatus: FULFILLMENT_STATUS.CANCELLED,
        });
        logger.info("cancelRegistration: pending order cancelled", { registrationId, orderId: order.id });
      }
      // Already refunded/cancelled — proceed without further financial action.
    }

    // Step 3: Soft-delete the registration.
    if (!handledByRefundTransaction) {
      await registrationRepo.destroy(registrationId);
      logger.info("cancelRegistration: registration soft-deleted", { registrationId, eventId });
    }
    return { cancelled: true };
  },
};
