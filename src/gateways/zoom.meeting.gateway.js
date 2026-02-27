/**
 * Zoom meeting provider: create meeting, add registrant, delete meeting, remove registrant.
 * Resolves host credentials internally (AdminZoomAccount); core never imports Zoom types.
 */

const logger = require("../config/logger");
const config = require("../config");
const { AdminZoomAccount } = require("../models");

const ZOOM_BASE = "https://api.zoom.us/v2";
const ZOOM_TOKEN_URL = "https://zoom.us/oauth/token";
const DEFAULT_TZ = "UTC";

// Refresh access token this many milliseconds before it actually expires
// to avoid using a token that expires mid-request.
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Build the start_time string for Zoom. Zoom treats this as local time in the specified timezone
 * when no UTC offset/Z suffix is present — so we pass the admin's local time directly and let
 * Zoom handle UTC conversion using the separate `timezone` field.
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} startTime - HH:mm or HH:mm:ss
 * @returns {string} Local datetime string "YYYY-MM-DDTHH:mm:ss" (no timezone suffix)
 */
function toZoomStartTime(startDate, startTime) {
  const dateStr = startDate ? String(startDate).substring(0, 10) : null;
  const timeStr = startTime ? String(startTime).substring(0, 5) : "09:00";
  if (!dateStr) {
    // Fallback: tomorrow at 09:00
    const tomorrow = new Date(Date.now() + 86400000);
    return `${tomorrow.toISOString().substring(0, 10)}T09:00:00`;
  }
  return `${dateStr}T${timeStr}:00`;
}

/**
 * @param {string} accessToken - Host's Zoom OAuth access token
 * @param {string} path - e.g. "/users/me/meetings"
 * @param {Object} options - { method, body }
 * @returns {Promise<Object>}
 */
async function zoomRequest(accessToken, path, options = {}) {
  const url = path.startsWith("http") ? path : `${ZOOM_BASE}${path}`;
  const { method = "GET", body } = options;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  const res = await fetch(url, {
    method,
    headers,
    ...(body && { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    const err = new Error(data.message || `Zoom API ${res.status}`);
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data;
}

/**
 * Use the stored refresh token to obtain a new access token from Zoom and
 * persist the updated credentials to the database.
 * @param {AdminZoomAccount} account - Sequelize model instance
 * @returns {Promise<string>} New access token
 */
async function refreshAccessToken(account) {
  if (!account.refreshToken) {
    throw new Error(
      "Zoom access token has expired and no refresh token is stored. " +
      "Please reconnect Zoom in admin settings."
    );
  }
  const auth = Buffer.from(
    `${config.zoom.clientId}:${config.zoom.clientSecret}`
  ).toString("base64");

  const res = await fetch(ZOOM_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: account.refreshToken,
    }).toString(),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    const msg = data.error_description || data.error || `HTTP ${res.status}`;
    throw new Error(
      `Zoom token refresh failed (${msg}). Please reconnect Zoom in admin settings.`
    );
  }

  await account.update({
    accessToken: data.access_token,
    refreshToken: data.refresh_token || account.refreshToken,
    tokenExpiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : null,
  });

  logger.info({ userId: account.userId }, "Zoom access token refreshed");
  return data.access_token;
}

/**
 * Return a valid access token for the account, refreshing automatically if the
 * token is expired or within the 5-minute buffer window.
 * @param {AdminZoomAccount} account - Sequelize model instance
 * @returns {Promise<string>} Valid access token
 */
async function getValidToken(account) {
  const expiresAt = account.tokenExpiresAt
    ? new Date(account.tokenExpiresAt).getTime()
    : null;

  const needsRefresh =
    expiresAt !== null &&
    expiresAt - Date.now() < TOKEN_REFRESH_BUFFER_MS;

  if (!needsRefresh) {
    return account.accessToken;
  }

  return await refreshAccessToken(account);
}

/**
 * Create a Zoom meeting for an event. Resolves host from userId (AdminZoomAccount).
 * @param {Object} event - Event plain object: startDate, startTime, durationMinutes, ...
 * @param {string} userId - Admin user id (must have connected Zoom)
 * @returns {Promise<{ providerMeetingId, joinUrl, startUrl?, provider, hostAccountId }>}
 */
async function createMeeting(event, userId) {
  const account = await AdminZoomAccount.findOne({ where: { userId } });
  if (!account || !account.accessToken) {
    throw new Error("Zoom host account or access token missing. Connect Zoom in admin settings.");
  }

  const accessToken = await getValidToken(account);

  const startDate = event.startDate ? String(event.startDate).substring(0, 10) : null;
  const startTime = event.startTime != null ? String(event.startTime).substring(0, 5) : "09:00";
  const timezone = event.timezone && String(event.timezone).trim() ? String(event.timezone).trim() : DEFAULT_TZ;
  const startLocal = toZoomStartTime(startDate, startTime);
  const duration = Math.max(15, Math.min(480, Number(event.durationMinutes) || 60));

  // Use product title only as the meeting topic — Zoom already shows date/time separately.
  const topic = ((event.productTitle && String(event.productTitle).trim())
    || (event.productSlug && String(event.productSlug).trim())
    || "Online Event").substring(0, 200);

  const body = {
    topic,
    type: 2, // scheduled
    start_time: startLocal,
    duration: duration,
    timezone: timezone,
    settings: {
      approval_type: 0,
      registration_type: 1,
      join_before_host: false,
    },
  };

  const zoomUserId = account.zoomUserId || "me";
  const data = await zoomRequest(accessToken, `/users/${zoomUserId}/meetings`, {
    method: "POST",
    body,
  });

  const joinUrl = data.join_url || "";
  const startUrl = data.start_url || "";
  const providerMeetingId = data.id ? String(data.id) : "";
  if (!providerMeetingId || !joinUrl) {
    throw new Error("Zoom did not return meeting id or join URL.");
  }

  logger.info({ zoomMeetingId: providerMeetingId, eventId: event.id }, "Zoom meeting created");
  return {
    providerMeetingId,
    joinUrl,
    startUrl,
    provider: "zoom",
    hostAccountId: account.id,
  };
}

/**
 * Add a registrant to a Zoom meeting. Resolves host token from meeting (hostAccountId -> AdminZoomAccount).
 * @param {Object} meeting - EventMeeting-like plain: { providerMeetingId, hostAccountId }
 * @param {Object} registration - Registration-like plain: { email, forename, surname }
 * @returns {Promise<{ providerRegistrantId?: string }>}
 */
async function addRegistrant(meeting, registration) {
  if (!meeting || !meeting.providerMeetingId) {
    throw new Error("Meeting or providerMeetingId missing.");
  }
  const account = meeting.hostAccountId
    ? await AdminZoomAccount.findByPk(meeting.hostAccountId)
    : null;
  if (!account || !account.accessToken) {
    throw new Error("Zoom access token missing for add registrant.");
  }

  const accessToken = await getValidToken(account);

  const email = (registration.email || "").trim();
  if (!email) {
    throw new Error("Registrant email is required.");
  }

  const body = {
    email,
    first_name: (registration.forename || "").trim().substring(0, 64) || "Attendee",
    last_name: (registration.surname || "").trim().substring(0, 64) || "",
  };

  const data = await zoomRequest(
    accessToken,
    `/meetings/${meeting.providerMeetingId}/registrants`,
    { method: "POST", body }
  );

  // The Zoom add-registrant response shape:
  //   data.id            → the MEETING id (integer) — not the registrant id
  //   data.registrant_id → the unique registrant UUID — this is what we store
  const providerRegistrantId = data.registrant_id ? String(data.registrant_id) : undefined;
  if (providerRegistrantId) {
    logger.info({ meetingId: meeting.providerMeetingId, registrantId: providerRegistrantId }, "Zoom registrant added");
  }
  return { providerRegistrantId };
}

/**
 * Remove a registrant from a Zoom meeting.
 * Zoom API: DELETE /meetings/{meetingId}/registrants   body: { registrants: [{ id }] }
 * @param {Object} meeting - EventMeeting-like: { providerMeetingId, hostAccountId }
 * @param {string} providerRegistrantId - Zoom registrant id
 * @returns {Promise<void>}
 */
async function removeRegistrant(meeting, providerRegistrantId) {
  if (!meeting || !meeting.providerMeetingId || !providerRegistrantId) return;
  const account = meeting.hostAccountId
    ? await AdminZoomAccount.findByPk(meeting.hostAccountId)
    : null;
  if (!account || !account.accessToken) return;

  let accessToken;
  try {
    accessToken = await getValidToken(account);
  } catch (e) {
    logger.warn({ err: e.message, meetingId: meeting.providerMeetingId }, "Zoom remove registrant: could not get valid token");
    return;
  }

  try {
    await zoomRequest(
      accessToken,
      `/meetings/${meeting.providerMeetingId}/registrants`,
      {
        method: "DELETE",
        body: { registrants: [{ id: String(providerRegistrantId) }] },
      }
    );
    logger.info({ meetingId: meeting.providerMeetingId, registrantId: providerRegistrantId }, "Zoom registrant removed");
  } catch (e) {
    logger.warn({ err: e.message, meetingId: meeting.providerMeetingId }, "Zoom remove registrant failed");
  }
}

/**
 * Delete a Zoom meeting.
 * @param {Object} meeting - EventMeeting-like: { providerMeetingId, hostAccountId }
 * @returns {Promise<void>}
 */
async function deleteMeeting(meeting) {
  if (!meeting || !meeting.providerMeetingId) return;
  const account = meeting.hostAccountId
    ? await AdminZoomAccount.findByPk(meeting.hostAccountId)
    : null;
  if (!account || !account.accessToken) return;

  let accessToken;
  try {
    accessToken = await getValidToken(account);
  } catch (e) {
    logger.warn({ err: e.message, meetingId: meeting.providerMeetingId }, "Zoom delete meeting: could not get valid token");
    return;
  }

  try {
    await zoomRequest(accessToken, `/meetings/${meeting.providerMeetingId}`, { method: "DELETE" });
    logger.info({ meetingId: meeting.providerMeetingId }, "Zoom meeting deleted");
  } catch (e) {
    logger.warn({ err: e.message, meetingId: meeting.providerMeetingId }, "Zoom delete meeting failed");
  }
}

module.exports = {
  createMeeting,
  addRegistrant,
  removeRegistrant,
  deleteMeeting,
};
