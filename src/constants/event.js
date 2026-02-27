/**
 * Event status constants. Used for event lifecycle (active, cancelled, orphaned).
 * Storefront only shows active events.
 */

const EVENT_STATUSES = ["active", "cancelled", "orphaned"];
const EVENT_STATUS = Object.fromEntries(EVENT_STATUSES.map((s) => [s.toUpperCase(), s]));

module.exports = {
  EVENT_STATUSES,
  EVENT_STATUS,
};
