"use strict";

const orderHistoryRepo = require("../repos/orderHistory.repo");

/**
 * Fire-and-forget helper — records an order history event without blocking
 * the caller. Errors are swallowed and logged to console so a logging failure
 * never breaks the main business flow.
 *
 * @param {string} orderId
 * @param {string} event   - One of ORDER_HISTORY_EVENT values
 * @param {Object} [opts]
 * @param {boolean|null} [opts.success]  - true/false/null (informational)
 * @param {Object}       [opts.meta]     - Free-form JSON context
 * @param {string}       [opts.actorId]  - Admin user ID (null = system)
 */
function record(orderId, event, opts = {}) {
  if (!orderId || !event) return;
  orderHistoryRepo
    .record({ orderId, event, success: opts.success ?? null, meta: opts.meta || null, actorId: opts.actorId || null })
    .catch((err) => {
      console.error("[orderHistory] Failed to record event:", event, "for order:", orderId, err?.message || err);
    });
}

module.exports = { record };
