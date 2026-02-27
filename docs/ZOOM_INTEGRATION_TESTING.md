# Testing the Zoom integration

This guide covers how to verify that the Zoom meeting provider works end-to-end: **Connect Zoom** → **create online event** → **customer pays** → **registrant added to Zoom** → **attendee can join**.

---

## 1. Prerequisites

### Zoom OAuth app

1. Go to [Zoom App Marketplace](https://marketplace.zoom.us/) → **Develop** → **Build App** → **OAuth**.
2. Create an app (e.g. “My Online Events”). Note **Client ID** and **Client Secret**.
3. Under **Redirect URL for OAuth**, add your callback URL, e.g.:
   - Local: `http://localhost:3000/admin/zoom/callback` (or your `BASE_URL` + `/admin/zoom/callback`).
   - Production: `https://yourdomain.com/admin/zoom/callback`.
4. Under **Scopes**, add the following (use Zoom’s exact scope names from the app’s Scopes section):
   - **Create meetings:** `meeting:write:meeting` — required to create meetings via `POST /users/me/meetings`.
   - **Get Zoom user on connect:** `user:read:user` (User → “View a user”) — required for `GET /users/me` in the Connect Zoom callback.
   - **Add registrants to meetings:**
     - `meeting:write:registrant` — add a **single** registrant (used when a customer pays; one registrant per order line).
     - `meeting:write:batch_registrants` — add **multiple** registrants in one request (optional; only if you add batch registration later).
   If a scope name in the Zoom app looks different (e.g. under a “Meeting” group with a different label), pick the one that matches the description above. See [Zoom: OAuth scopes](https://developers.zoom.us/docs/integrations/oauth-scopes/) and [Granular scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-granular/) for the current list.

### Environment variables

In `.env` (or your environment):

```env
# Zoom (online events)
ZOOM_CLIENT_ID=your_client_id
ZOOM_CLIENT_SECRET=your_client_secret
# Optional; defaults to BASE_URL + /admin/zoom/callback
ZOOM_REDIRECT_URI=http://localhost:8080/admin/zoom/callback
```

Restart the app after changing these.

---

## 2. Manual test flow

### Step 1: Connect Zoom (admin)

1. Log in as an **admin** user.
2. In the admin dashboard, open **Connect Zoom** (sidebar link).
3. You should be redirected to Zoom to authorize the app, then back to admin with a success message (“Zoom account connected…”).
4. If you see “Zoom is not configured”, check `ZOOM_CLIENT_ID` and `ZOOM_CLIENT_SECRET`.

### Step 2: Create an online event (admin)

1. Go to an **event-type** section (e.g. **Webinars**, **Seminars**, **Classrooms**).
2. Open a product that has events (or create one) and go to its **events** page.
3. Add or edit an event and:
   - Set **Online** (or “Is online”) to **checked**.
   - Set start date/time and duration.
4. Save events.
5. If Zoom is connected, the app calls `ensureMeetingForOnlineEvent` and creates a Zoom meeting; an `EventMeeting` row is stored with `joinUrl`, `providerMeetingId`, `hostAccountId`.
6. If you see a warning like “Meeting provider not configured” or “Zoom host account or access token missing”, fix config or connect Zoom and save again.

**Quick check:** In the DB, `event_meetings` should have a row for the event with non-empty `join_url` and `provider_meeting_id`.

### Step 3: Customer pays for the event

1. As a **customer** (or guest), add the event to cart (or use the event’s product/variant flow) and go through checkout.
2. Pay with Stripe (or your configured gateway) so that `recordPaymentSuccess` runs (e.g. complete payment in test mode).
3. After payment, the order service:
   - Creates a **Registration** for the event/order line.
   - Calls the meeting provider’s **addRegistrant(meeting, registration)** so the attendee is added to the Zoom meeting.
4. Registration row should get `provider_registrant_id` set (from Zoom’s response).

**Quick check:** In the DB, `registrations` has a row for the order line and `provider_registrant_id` is set. In the Zoom dashboard, the meeting should show the registrant.

### Step 4: Attend the event

1. Use the meeting’s **join URL** (from `event_meetings.join_url` or from your app if you expose it on the event/order confirmation page).
2. Join as the registrant (same email as the order/registration).
3. Zoom may send a confirmation email to the registrant; joining via the link should work.

If any step fails, see **Troubleshooting** below.

---

## 3. What to verify

| Step              | What to check |
|-------------------|----------------|
| Connect Zoom      | Admin can open Connect Zoom and return with “Zoom account connected”; no “Zoom is not configured”. |
| Create meeting    | Saving an online event creates an `event_meetings` row with `join_url` and `provider_meeting_id`. |
| Payment → register| After payment, `registrations` has the attendee and `provider_registrant_id` is set; Zoom meeting shows the registrant. |
| Join              | Join URL works and the registrant can enter the meeting. |

---

## 4. Troubleshooting

- **“Zoom is not configured”**  
  Set `ZOOM_CLIENT_ID` and `ZOOM_CLIENT_SECRET` and restart. Ensure the app is loading the same `.env` (e.g. no typo in env file name or path).

- **“Zoom host account or access token missing. Connect Zoom in admin settings.”**  
  The admin who saved the event has not connected Zoom, or the stored token is invalid/expired. Have that admin go to **Connect Zoom** again (re-authorize). If Zoom uses refresh tokens, ensure the callback stores them and that token refresh is implemented if needed.

- **“Meeting provider not configured.”**  
  `getMeetingProvider()` returns `null`: Zoom config is missing or incomplete. Check `config.zoom.clientId` and `config.zoom.clientSecret` (from env).

- **Meeting created but no registrant after payment**  
  Check app logs for errors in `recordPaymentSuccess` (e.g. when calling `provider.addRegistrant`). Confirm the event has `isOnline` true and an `EventMeeting`; confirm Zoom scope allows adding registrants. Check Zoom API response in the gateway (e.g. 4xx and message).

- **Redirect URI mismatch**  
  Zoom shows “redirect_uri” error. Ensure `ZOOM_REDIRECT_URI` (or default `BASE_URL + /admin/zoom/callback`) exactly matches the URL configured in the Zoom OAuth app, including scheme and path.

---

## 5. Optional: unit/integration tests

To test the integration in code without hitting Zoom:

- **Meeting provider:** Mock `getMeetingProvider()` to return an object that implements `createMeeting` and `addRegistrant` and assert that order/event services call them with the expected arguments (e.g. after payment, `addRegistrant(meeting, registration)` is called for online events).
- **Zoom gateway:** Use a test double for `fetch` (or a Zoom sandbox) and assert that the gateway builds the correct requests and maps responses to `providerMeetingId`, `joinUrl`, `providerRegistrantId`, etc.

The manual flow above is the most direct way to confirm that real Zoom creation and registration work.
