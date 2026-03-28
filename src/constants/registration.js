/**
 * Registration status constants. Source of truth for valid registration statuses.
 * Used by Registration model, order.service, and event.service.
 */

const REGISTRATION_STATUS_LIST = ["registered", "cancelled"];

const REGISTRATION_STATUS = Object.fromEntries(REGISTRATION_STATUS_LIST.map((s) => [s.toUpperCase(), s]));

module.exports = {
  REGISTRATION_STATUS_LIST,
  REGISTRATION_STATUS,
};
