/**
 * Meeting provider interface (Stripe-style abstraction for online events).
 *
 * Core services use only getMeetingProvider() and these methods. No provider-specific
 * types (e.g. AdminZoomAccount) in core; the provider resolves host credentials.
 *
 * Implementations (e.g. Zoom) provide:
 * - createMeeting(event, userId) -> Promise<{ zoomMeetingId, zoomHostAccountId }>
 *   Provider resolves host account from userId (e.g. Zoom loads AdminZoomAccount by userId).
 * - addRegistrant(meeting, registration) -> Promise<{ providerRegistrantId? }>
 *   Provider resolves host token from meeting (e.g. meeting.zoomHostAccountId -> AdminZoomAccount).
 *
 * event: plain { id, startDate, startTime, durationMinutes, ... }
 * meeting: EventMeeting-like plain object (zoomMeetingId, zoomHostAccountId, ...)
 * registration: Registration-like plain { email, forename, surname, ... }
 */

const zoomMeetingGateway = require("./zoom.meeting.gateway");
const config = require("../config");

function getMeetingProvider() {
  if (config.zoom && config.zoom.clientId && config.zoom.clientSecret) {
    return zoomMeetingGateway;
  }
  return null;
}

module.exports = { getMeetingProvider };
