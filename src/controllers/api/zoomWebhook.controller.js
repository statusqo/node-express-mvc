/**
 * Zoom webhook endpoint. Handles meeting.deleted and URL validation.
 * Mount with express.raw({ type: "application/json" }) so the raw body is
 * available for HMAC signature verification.
 */
const crypto = require("crypto");
const config = require("../../config");
const logger = require("../../config/logger");
const eventService = require("../../services/event.service");

/**
 * Verify the Zoom webhook signature.
 *
 * Zoom signs every request with:
 *   x-zm-signature:          "v0=<hex-hmac>"
 *   x-zm-request-timestamp:  unix epoch seconds (string)
 *
 * HMAC message: "v0:<timestamp>:<raw-body>"
 * Requests older than 5 minutes are rejected (replay-attack protection).
 *
 * @param {import('express').Request} req
 * @param {string} secret - ZOOM_WEBHOOK_SECRET
 * @returns {boolean}
 */
function verifyZoomSignature(req, secret) {
  const timestamp = req.headers["x-zm-request-timestamp"];
  const signature = req.headers["x-zm-signature"];
  if (!timestamp || !signature) return false;

  // Reject if the request is older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  const rawBody = Buffer.isBuffer(req.body)
    ? req.body.toString("utf8")
    : JSON.stringify(req.body);

  const message = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${crypto.createHmac("sha256", secret).update(message).digest("hex")}`;

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "utf8"),
      Buffer.from(expected, "utf8")
    );
  } catch {
    return false;
  }
}

/**
 * POST /api/zoom/webhook
 * Body: JSON (or validation payload with plainToken).
 */
async function webhook(req, res) {
  logger.info("Zoom webhook: POST /api/zoom/webhook hit");

  let body;
  const raw = req.body;
  if (Buffer.isBuffer(raw)) {
    try {
      body = JSON.parse(raw.toString("utf8"));
    } catch {
      logger.warn("Zoom webhook: invalid JSON body");
      return res.status(400).json({ error: "Invalid JSON" });
    }
  } else if (typeof raw === "object") {
    body = raw;
  } else {
    return res.status(400).json({ error: "Invalid body" });
  }

  // URL validation challenge — Zoom sends this when you first register or update
  // the webhook endpoint in the Marketplace. Respond with the HMAC of the plainToken.
  // Signature verification is intentionally skipped here so the initial setup flow
  // works before ZOOM_WEBHOOK_SECRET is confirmed in the environment.
  if (body.plainToken) {
    const secret = (config.zoom && config.zoom.webhookSecret) ? config.zoom.webhookSecret : "";
    const encrypted = crypto.createHmac("sha256", secret).update(body.plainToken).digest("hex");
    return res.json({ encryptedToken: encrypted });
  }

  // For all real events, verify the Zoom signature before processing.
  const secret = config.zoom && config.zoom.webhookSecret;
  if (!secret) {
    logger.error(
      "Zoom webhook: ZOOM_WEBHOOK_SECRET is not configured. " +
      "Set it in your environment to enable webhook processing."
    );
    // Return 200 so Zoom does not retry and fill logs, but do not process the event.
    return res.status(200).send();
  }

  if (!verifyZoomSignature(req, secret)) {
    logger.warn(
      "Zoom webhook: signature verification failed — request rejected",
      { event: body.event }
    );
    return res.status(401).json({ error: "Invalid signature" });
  }

  const eventType = body.event;
  const payload = body.payload || {};

  logger.info(
    "Zoom webhook received",
    { event: eventType, payloadKeys: Object.keys(payload) }
  );

  if (eventType === "meeting.deleted") {
    const object = payload.object || payload;
    const meetingIdRaw = object.id ?? object.meeting_id ?? payload.id;
    const meetingId = meetingIdRaw != null ? String(meetingIdRaw) : null;

    if (!meetingId) {
      logger.warn(
        "Zoom meeting.deleted: no meeting id in payload",
        { payloadKeys: Object.keys(payload), objectKeys: object && typeof object === "object" ? Object.keys(object) : [] }
      );
      return res.status(200).send();
    }

    try {
      const result = await eventService.handleZoomMeetingDeleted(meetingId);
      if (result.handled) {
        // resyncOrphanedEvent will create a fresh EventMeeting when the admin re-syncs.
        logger.info("Event marked orphaned and stale meeting record removed (Zoom meeting deleted)", { eventId: result.eventId, meetingId });
      } else {
        logger.info(
          "Zoom meeting.deleted: no linked event (meeting may have been deleted from app)",
          { meetingId }
        );
      }
    } catch (e) {
      logger.error("Zoom webhook: failed to mark event orphaned", { err: e.message, meetingId });
    }
  } else {
    logger.info("Zoom webhook: unhandled event type (ignored)", { event: eventType });
  }

  res.status(200).send();
}

module.exports = { webhook };
