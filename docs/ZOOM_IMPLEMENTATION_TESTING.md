# Zoom Integration – Step-by-Step Testing Instructions

Use these steps to verify the Zoom integration improvements (sync status, Sync With Zoom, auto-sync after connect, timezone, orphaned/cancel flows, webhook).

---

## Prerequisites

1. **Zoom OAuth app**  
   Same as in [ZOOM_INTEGRATION_TESTING.md](./ZOOM_INTEGRATION_TESTING.md): Client ID, Client Secret, Redirect URL, scopes (`meeting:write:meeting`, `user:read:user`, `meeting:write:registrant`). Add scope for **delete meeting** if not already present (same `meeting:write:meeting` usually covers it).

2. **Environment**  
   In `.env`:
   - `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`
   - `ZOOM_REDIRECT_URI` (optional; defaults to `BASE_URL` + `/admin/zoom/callback`)
   - `ZOOM_WEBHOOK_SECRET` (optional; required only for Zoom webhook URL validation in Marketplace)

3. **Migrations**  
   Run: `npx sequelize-cli db:migrate`  
   Ensures `events.timezone` and `events.eventStatus` exist.

4. **Start the app**  
   `npm run dev` (or `node src/server.js`).

---

## 1. Connect Zoom and auto-sync

1. Log in as **admin**.
2. Open **Connect Zoom** from the admin sidebar.
3. Authorize the app on Zoom; you should be redirected **back to the dashboard** (not a separate “connected” page).
4. **Check flash message:**  
   - “Zoom connected. Created N meeting(s)…” if there were online events without meetings, or  
   - “Zoom account connected. All online events already have meetings.” or similar.
5. **Verify:** No separate “Sync all” page; only dashboard with flash.

---

## 2. Events page – Meeting link column and Sync With Zoom

1. Go to **Webinars** (or Seminars / Classrooms) → open a product → **Events**.
2. **Meeting link column**  
   - **Synced:** Green circle with ✓ for online events that have a Zoom meeting.  
   - **Not synced:** Red circle with — for online events without a meeting.  
   - **Not online:** — or empty.  
   - **Orphaned:** “Orphaned” badge for events whose Zoom meeting was deleted (see section 5).
3. **Timezone column**  
   - Existing events show stored timezone or “—”.  
   - New events (Add Event) have a **Timezone** dropdown (UTC, Europe/London, etc.).
4. **Sync With Zoom button**  
   - **When Zoom is connected:** Button is enabled, below “Add Event”. Click it; you should get a flash like “Created N meeting(s)” or “All online events already have Zoom meetings.”  
   - **When Zoom is not connected:** Button is **greyed out** (disabled) with tooltip “Connect Zoom first.”  
   - **Verify:** Only one sync control on the Events page (no “Sync all” elsewhere).

---

## 3. Timezone and meeting time

1. **Add a new event** with **Online** checked, **Start date**, **Start time**, and **Timezone** (e.g. Europe/London).
2. Save. Ensure a Zoom meeting is created (e.g. via Sync With Zoom or auto-sync).
3. **Check on Zoom** (Zoom dashboard or API): meeting start time should match the **local** time you entered in the chosen timezone (not UTC-only).  
   Example: 14:00 Europe/London should show as 14:00 London time on Zoom.

---

## 4. Storefront – only active events

1. Create an event and ensure it has **eventStatus** = active (default).
2. On the **public** site, go to the same section (e.g. /webinars) and open the product; the event should appear.
3. **Orphan or cancel an event** (see below); then reload the public product page.  
   **Verify:** That event no longer appears in the list (only active events are shown).

---

## 5. Orphaned event (Zoom meeting deleted) – Re-sync and Cancel

1. **Create an online event** with a Zoom meeting (sync so “Meeting link” shows synced).
2. **Delete the meeting in Zoom** (Zoom dashboard or API: delete that meeting).
3. **Trigger the webhook** (or simulate):  
   - If you configured Zoom webhook URL in the Marketplace, deleting the meeting should send `meeting.deleted` to your app.  
   - Or manually set the event to orphaned in the DB:  
     `UPDATE events SET eventStatus = 'orphaned' WHERE id = '<event_id>';`
4. On the **Events** page, the event should show **“Orphaned”** in the Meeting link column.
5. **Re-sync**  
   - Click **Re-sync** for that event.  
   - **Verify:** Flash “Event re-synced… New meeting created and registrants added.”  
   - Meeting link column shows synced again; in Zoom a new meeting exists and existing registrants are added.
6. **Cancel (orphaned)**  
   - Delete the meeting in Zoom again (or set event back to orphaned in DB).  
   - Click **Cancel** for that event; confirm in the browser dialog.  
   - **Verify:** Registrations deleted, orders refunded (if any), users notified (if email configured); event is cancelled or deleted (no orders → deleted; has orders → eventStatus = cancelled).

---

## 6. Cancel event (from app)

1. Create an online event **with at least one registration** (customer paid for it).
2. On the **Events** page, that event should show a **Cancel event** button (and possibly Remove).
3. Click **Cancel event**, confirm in the dialog.
4. **Verify:**  
   - Registrants removed from Zoom, Zoom meeting deleted.  
   - Registrations **deleted** in the DB.  
   - Related orders **refunded** (Stripe).  
   - Cancellation email sent to each order email (if SMTP configured).  
   - If the event had orders: event remains with **eventStatus** = cancelled (shallow delete).  
   - If it had no orders: event (and variant/meeting) **deleted**.

---

## 7. Remove event (no registrations)

1. Create an online event **with no registrations** (no one has paid).
2. Click **Remove**, then **Save**.
3. **Verify:** Event and its variant/price are deleted; if it had a Zoom meeting, it is not deleted on Zoom by this flow (only “Cancel event” deletes the meeting).  
   For a full cleanup when the event has no orders, use **Cancel event** (which will delete the meeting and then the event) or keep Remove for simple delete when no orders exist.

---

## 8. Zoom webhook (meeting.deleted)

1. **Configure in Zoom Marketplace:**  
   - Webhook URL: `https://your-domain.com/api/zoom/webhook` (or your BASE_URL + `/api/zoom/webhook` for local testing with a tunnel).  
   - Subscribe to **meeting.deleted**.  
   - Set **Verification token** and add it to `.env` as `ZOOM_WEBHOOK_SECRET`.
2. **Validation:**  
   - Zoom will send a validation request with `plainToken`.  
   - The app responds with `encryptedToken` (HMAC-SHA256 of plainToken with secret).  
   - **Verify:** Zoom accepts the URL.
3. **Event:**  
   - Delete a meeting in Zoom that is linked to an event (same `provider_meeting_id` in `event_meetings`).  
   - **Verify:** The corresponding event’s `eventStatus` is set to `orphaned` and the Events page shows “Orphaned” for that event.

### Troubleshooting: Webhook received but event not marked Orphaned

- **Check app logs** – The app logs every webhook request:
  - `Zoom webhook received` – event type and payload keys (confirms Zoom is calling your endpoint).
  - `Event marked orphaned` – we found an `EventMeeting` and updated the event.
  - `Zoom meeting.deleted: no EventMeeting found for this meeting id` – webhook arrived but the meeting id in the payload does not match any `event_meetings.provider_meeting_id` in your DB. Compare the logged `meetingId` with the value in your database for that event.
- **Check meeting id format** – Zoom may send the meeting id as a number; we normalize with `String()`. Your `event_meetings.provider_meeting_id` should match (e.g. `"8439827423"`). If Zoom sends a different identifier, the log shows `payloadKeys` and `objectKeys` so you can adjust the handler.
- **ngrok free tier** – If Zoom gets an HTML interstitial page instead of your app’s response, validation or delivery may fail. Use ngrok’s request inspector (http://127.0.0.1:4040) to confirm Zoom’s POST reaches your app and you return 200.
- **Confirm URL** – In Zoom, the Event notification endpoint URL must be exactly `https://your-ngrok-host/api/zoom/webhook` (no trailing slash). The app always responds with 200.

---

## 9. Quick checklist

| Feature | How to test |
|--------|-------------|
| Connect Zoom → dashboard + flash | Connect Zoom; redirect to dashboard; flash shows success and sync result. |
| Auto-sync after connect | After connecting, flash mentions created meetings or “already synced”. |
| Sync With Zoom button | On Events page, below Add Event; enabled when Zoom connected, greyed out when not. |
| Meeting link column | Synced ✓, not synced −, orphaned badge, — for not online. |
| Timezone | New event has timezone dropdown; Zoom meeting uses that timezone for start time. |
| Storefront only active events | Cancelled/orphaned events do not appear on public event list. |
| Orphaned: Re-sync | Orphaned event → Re-sync → new meeting + registrants added. |
| Orphaned: Cancel | Orphaned event → Cancel → confirm → refunds, emails, event cancelled or deleted. |
| Cancel event (with regs) | Event with registrations → Cancel event → confirm → Zoom cleaned, regs deleted, refunds, emails. |
| Zoom webhook | meeting.deleted → event marked orphaned. |

---

## 10. Optional: Webhook local testing

### Why ngrok for Zoom but not for Stripe?

- **Stripe:** The Stripe CLI (`stripe listen --forward-to localhost:8080/api/stripe/webhook`) creates a tunnel from Stripe’s servers to your machine and forwards webhooks to localhost. You don’t need ngrok because Stripe provides that forwarding.
- **Zoom:** Zoom has no equivalent “listen and forward” tool. The webhook URL you register in the Zoom Marketplace must be a **public URL** that Zoom can call. So to receive Zoom webhooks on your local app you need a tunnel (e.g. **ngrok**) that exposes `http://localhost:8080` as a public HTTPS URL. Use that URL in Zoom (e.g. `https://your-subdomain.ngrok-free.app/api/zoom/webhook`).

In development, the app allows any `Host` header, so your ngrok URL works without setting `ALLOWED_HOSTS`.

### Testing with ngrok

- Use a tunnel (e.g. ngrok) so Zoom can reach `https://your-ngrok-url/api/zoom/webhook`.  
- Or simulate with curl:
  - Validation:  
    `curl -X POST https://localhost:8080/api/zoom/webhook -H "Content-Type: application/json" -d '{"plainToken":"test123"}'`  
    (Expect JSON with `encryptedToken`.)
  - meeting.deleted:  
    `curl -X POST https://localhost:8080/api/zoom/webhook -H "Content-Type: application/json" -d '{"event":"meeting.deleted","payload":{"object":{"id":"<provider_meeting_id>"}}}'`  
    (Replace `<provider_meeting_id>` with a real `event_meetings.provider_meeting_id` from your DB.)
