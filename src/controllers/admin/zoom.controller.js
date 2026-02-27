/**
 * Admin Zoom OAuth: connect Zoom account for hosting online events.
 */
const config = require("../../config");
const { AdminZoomAccount } = require("../../models");
const crypto = require("crypto");

const ZOOM_AUTH_URL = "https://zoom.us/oauth/authorize";
const ZOOM_TOKEN_URL = "https://zoom.us/oauth/token";

function getRedirectUri(req) {
  const base = (req.protocol || "https") + "://" + (req.get("host") || "");
  return (config.zoom && config.zoom.redirectUri) || `${base}/admin/zoom/callback`;
}

async function connect(req, res) {
  if (!req.user || !req.user.isAdmin) {
    res.setFlash("error", "Unauthorized.");
    return res.redirect((req.adminPrefix || "") + "/");
  }
  if (!config.zoom || !config.zoom.clientId || !config.zoom.clientSecret) {
    res.setFlash("error", "Zoom is not configured.");
    return res.redirect((req.adminPrefix || "") + "/");
  }
  const state = crypto.randomBytes(16).toString("hex");
  req.session.zoomOAuthState = state;
  const redirectUri = getRedirectUri(req);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.zoom.clientId,
    redirect_uri: redirectUri,
    state,
  });
  return res.redirect(`${ZOOM_AUTH_URL}?${params.toString()}`);
}

async function callback(req, res) {
  if (!req.user || !req.user.isAdmin) {
    res.setFlash("error", "Unauthorized.");
    return res.redirect((req.adminPrefix || "") + "/");
  }
  const state = req.query.state;
  if (!state || state !== req.session.zoomOAuthState) {
    res.setFlash("error", "Invalid state. Please try connecting again.");
    return res.redirect((req.adminPrefix || "") + "/");
  }
  delete req.session.zoomOAuthState;

  const code = req.query.code;
  if (!code) {
    res.setFlash("error", "Zoom did not return an authorization code.");
    return res.redirect((req.adminPrefix || "") + "/");
  }

  const redirectUri = getRedirectUri(req);
  const auth = Buffer.from(`${config.zoom.clientId}:${config.zoom.clientSecret}`).toString("base64");
  const resToken = await fetch(ZOOM_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });
  const data = await resToken.json();
  if (!resToken.ok || !data.access_token) {
    const msg = data.error_description || data.error || "Failed to get Zoom tokens.";
    res.setFlash("error", msg);
    return res.redirect((req.adminPrefix || "") + "/");
  }

  const zoomUserRes = await fetch("https://api.zoom.us/v2/users/me", {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  const zoomUser = await zoomUserRes.json();
  const zoomUserId = zoomUser.id ? String(zoomUser.id) : null;
  if (!zoomUserId) {
    res.setFlash("error", "Could not fetch Zoom user.");
    return res.redirect((req.adminPrefix || "") + "/");
  }

  const existing = await AdminZoomAccount.findOne({ where: { userId: req.user.id } });
  const payload = {
    userId: req.user.id,
    zoomUserId,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    tokenExpiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
  };
  if (existing) {
    await existing.update(payload);
  } else {
    await AdminZoomAccount.create(payload);
  }

  const eventService = require("../../services/event.service");
  try {
    const { created, errors } = await eventService.syncAllEvents(req.user.id);
    if (created > 0 && errors.length === 0) {
      res.setFlash("success", `Zoom connected. Created ${created} meeting(s) for online events.`);
    } else if (errors.length > 0) {
      // Account IS connected; only the auto-sync was partial. Use info rather than
      // success (not everything worked) or error (the connection itself succeeded).
      const note = created > 0 ? ` Created ${created} meeting(s).` : "";
      res.setFlash("info", `Zoom connected.${note} Some events could not be synced: ${errors[0] || "unknown error"}. Use Sync With Zoom to retry.`);
    } else {
      res.setFlash("success", "Zoom account connected. All online events already have meetings.");
    }
  } catch (_) {
    res.setFlash("success", "Zoom account connected. You can sync events from the Events page.");
  }
  res.redirect((req.adminPrefix || "") + "/");
}

module.exports = { connect, callback };