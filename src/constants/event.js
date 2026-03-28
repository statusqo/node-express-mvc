/**
 * Event status constants. Used for event lifecycle (active, cancelled, orphaned).
 * Storefront only shows active events.
 */

const EVENT_STATUS_LIST = ["active", "cancelled", "orphaned"];
const EVENT_STATUS = Object.fromEntries(EVENT_STATUS_LIST.map((s) => [s.toUpperCase(), s]));

module.exports = {
  EVENT_STATUS_LIST,
  EVENT_STATUS,
};
