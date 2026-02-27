# Zoom Integration Improvements – Implementation Proposal

This document proposes how to implement sync status, “Sync all events”, deletion flows, and timezone handling for the Zoom integration. **No code is changed yet**—this is a plan for your approval before implementation.

---

## 1. Current Behaviour (Summary)

- **Connect Zoom:** Admin goes to **Connect Zoom** in the sidebar (`/admin/zoom/connect`), authorises the app, and is redirected to admin home with “Zoom account connected”.
- **Meeting creation:** When an admin saves events on a product’s events page (`eventsSave`), the app calls `ensureMeetingForOnlineEvent(eventId, userId)` for each **online** event. A meeting is created only if there is **no** `EventMeeting` row for that event. The Zoom gateway creates the meeting with `start_time: new Date(startDate + 'T' + startTime).toISOString()` and `timezone: "UTC"`, so the time is effectively treated as server-local then sent as UTC.
- **Registrations:** After payment, `recordPaymentSuccess` creates a `Registration` and calls the meeting provider’s `addRegistrant(meeting, registration)` so the attendee is added on Zoom.
- **Event delete:** `event.service.delete()` only deletes an event if its variant has **no** order lines. It does not touch `EventMeeting`, registrations, or refunds.
- **Zoom webhooks:** There are no Zoom webhooks in the app yet; only Stripe webhooks exist. Zoom supports a `meeting.deleted` webhook that we can use to detect when a meeting is removed on Zoom.

---

## 2. Sync Status (Which Events Have a Zoom Meeting)

### 2.1 Definition

- **Synchronised:** The event is online and has an `EventMeeting` row with a non-empty `providerMeetingId` (i.e. a meeting was created on Zoom).
- **Not synchronised:** The event is online but has no `EventMeeting` (or no valid `providerMeetingId`). Non-online events can show “N/A” or no icon.

### 2.2 Data

- When loading the events list for a product, include `EventMeeting` (e.g. in `eventService.findByProductId(..., { include: [ProductVariant, EventMeeting] })`).
- For each event, derive `syncedWithZoom = ev.isOnline && ev.EventMeeting && ev.EventMeeting.providerMeetingId`.

### 2.3 UI (Events Table)

- Add a column with a **professional label** so it’s clear this is about the Zoom meeting link, not generic “sync”. Suggested header: **“Meeting link”** (meaning “has a meeting link on Zoom” vs “no meeting link yet”). Alternatives: **“Zoom meeting”**, **“Online meeting”**. We’ll use **“Meeting link”** unless you prefer another.
- Per row:
  - **Synced:** Green circle with white tick (e.g. CSS class `sync-badge sync-badge-synced` + icon or Unicode ✓). Tooltip: “Meeting created on Zoom.”
  - **Not synced (online):** Red circle with white minus/dash (e.g. `sync-badge sync-badge-not-synced`). Tooltip: “No Zoom meeting yet.”
  - **Not online:** Empty or “—”.
- For **orphaned** events (see §4.1), the same column can show a distinct state (e.g. “Orphaned” badge or icon) with tooltip “Zoom meeting was deleted; event kept for records.”


---

## 3. “Sync With Zoom” – Where the Button Lives

### 3.1 After Connect Zoom

- **No separate page.** After a successful OAuth callback, redirect the admin **back to the dashboard** (e.g. `/admin/` or current admin home).
- Show a **flash message** for success or failure (e.g. “Zoom account connected.” or the error from Zoom).
- **Auto-sync:** Immediately after a successful connection, the application **automatically attempts to synchronise all events** with Zoom (i.e. create meetings for all online events that don’t have an `EventMeeting` yet). The flash can include the result (e.g. “Zoom connected. Created N meetings.” or “Zoom connected. All events were already synced.”).

### 3.2 “Sync With Zoom” on the Events Page Only

- The **only** sync button in the UI is **“Sync With Zoom”** on the **product events page** (same page as the events table), placed **below the Add Event button**.
- **When Zoom is not connected:** the button is **greyed out** (disabled and visually muted); optional tooltip: “Connect Zoom first.”
- **When Zoom is connected:** the button is active and POSTs to e.g. `POST /admin/:sectionPath/:productSlug/events/sync-zoom`.
- Handler: load this product’s online events that have no `EventMeeting` (and are not orphaned/cancelled, per filters), call `ensureMeetingForOnlineEvent` for each, then redirect back to that product’s events page with a flash (e.g. “Created N meetings.”).

No separate “Sync all” page and no “Sync all” button—only dashboard redirect with flash and auto-sync on connect, plus the single “Sync With Zoom” button on each Events page.

---

## 4. Deletion Flows

**Integrity principle:** Each Event has a ProductVariant; OrderLines reference that variant. Deleting an Event (and its variant) when Orders exist would break referential integrity and historical reporting. So: **we never delete an Event (or its variant) if any Order references it.** Instead we mark the event as inactive/cancelled/orphaned and keep it for the record. Admin must always see **all orders ever made**.

---

### 4.1 (a) Admin Deletes Meeting on Zoom → App Notified

- **Zoom webhook:** Add an endpoint, e.g. `POST /api/zoom/webhook`. On `meeting.deleted`, find `EventMeeting` by `providerMeetingId` and update the corresponding **Event** to **orphaned**.
- **Orphaned meaning:** When the Zoom meeting is deleted on Zoom, that meeting **and its registrants** are already gone on Zoom. The app marks the Event as **orphaned** so we know the meeting no longer exists. Orphaned events are **excluded from front-end** (storefront). In admin they remain visible with clear options.
- **Schema:** `events.eventStatus` = `'active' | 'cancelled' | 'orphaned'`. On webhook, set `eventStatus = 'orphaned'`. The old `EventMeeting` row can be removed or kept (e.g. clear `providerMeetingId` / mark invalid) since the meeting no longer exists on Zoom.
- **Admin options for orphaned events:**
  - **Re-sync with Zoom:** Create a **new** Zoom meeting for this event and **add all existing registrants** (from `Registration` rows for this event) back to the new meeting. After success, set `eventStatus = 'active'` and store the new `EventMeeting` (new `providerMeetingId`, joinUrl, etc.). Registrations stay; we do not refund or delete them.
  - **Cancel:** Run the cancel flow: clear Registrations (see below), refund orders, notify users via email. Refunded **orders stay in the app**. Events that have orders get `eventStatus = 'cancelled'` (shallow delete to preserve integrity). Events with **no** orders can be **truly deleted** (remove Event, variant, EventMeeting).
- **Confirmation:** Use a **modal** for both “Re-sync” and “Cancel” so the admin confirms the action.

---

### 4.2 (b) Admin Deletes Event in the App

- **Rule:** If the Event has **any** Orders (order lines referencing this event’s variant), **do not** hard-delete the Event or the variant. Use **shallow delete**: set `eventStatus = 'cancelled'` so the event is hidden from the storefront but all data remains for integrity and reporting.
- **Flow when admin chooses to remove/cancel the event:**
  1. **Remove registrants from the Zoom meeting** (if the meeting still exists), then **delete the Zoom meeting** via Zoom API.
  2. **Registrations:** **Delete** the Registration rows (remove them from the DB). Orders and OrderLines stay; we do not delete orders. Deleting Registrations clears the link between the event and attendees while preserving order history.
  3. **Refund** the related orders (using existing Stripe/refund path).
  4. **Notify users** via nodemailer (event cancelled, order refunded).
  5. **Event record:**
     - If **no orders** for this event: **truly delete** the Event, its ProductVariant, ProductPrices, and EventMeeting.
     - If **there are orders:** **shallow delete** — set `eventStatus = 'cancelled'`. Keep Event, ProductVariant, OrderLines; Registrations have already been deleted in step 2. Admin still sees all orders ever made.
- **Confirmation:** Use a **modal** describing: remove from Zoom, delete meeting, delete registrations, refund orders, email attendees; event will be [deleted / marked cancelled if it has orders].

---

### 4.3 Shared Behaviour and Open Points

- **Unregister from Zoom:** When we still have a meeting (app-initiated cancel or before deleting meeting), remove registrants from the Zoom meeting then delete the meeting. When the meeting was already deleted on Zoom (webhook), there is nothing to unregister.
- **Registrations:** When cancelling an event (from app or when cancelling an orphaned event), **delete** Registration rows so they are removed from the DB. Orders and OrderLines remain for history; we never delete orders.
- **Order deletion:** No order deletion in the app. Backups (export) for future purge of inactive events can be a follow-up.

### 4.4 Decisions and open points

| Topic | Decision / open point |
|-------|------------------------|
| **Column name** | Use **“Meeting link”** for the Zoom sync column. |
| **Connect Zoom** | Redirect to dashboard with flash; **auto-sync all events** after successful connection. No separate “Sync all” page or button. |
| **Sync button** | **Only** “Sync With Zoom” on the Events page (below Add Event), greyed out when Zoom not connected. |
| **eventStatus** | Use **eventStatus** for lifecycle: `active \| cancelled \| orphaned`. “Meeting link” column shows synced / not synced / Orphaned for display. |
| **Orphaned** | Zoom meeting (and its registrants) deleted on Zoom → Event marked **orphaned**. Admin can **re-sync** (new meeting + add all registrants back) or **cancel** (delete Registrations, refund, notify; orders stay; event cancelled if has orders, truly deleted if no orders). |
| **Registrations on cancel** | **Delete** Registration rows when cancelling an event (app or orphaned). Orders stay. |
| **Modal** | Confirmation modal for re-sync, cancel orphaned, and cancel event from app. |
| **Orders** | Never delete orders. Admin sees all orders ever made. Events with orders: shallow delete (cancelled). Events with no orders: can be truly deleted. |

---

## 5. Timezone Fix (Event Time vs Zoom Meeting Time)

### 5.1 Cause of Mismatch

- The app stores `Event.startDate` (DATEONLY) and `Event.startTime` (TIME) with **no timezone**.
- The Zoom gateway builds: `start = new Date(startDate + 'T' + startTime + ':00')`. In Node this is interpreted in **server** local time, then `start.toISOString()` sends **UTC** to Zoom. So if the admin enters “14:00” meaning 2pm in their timezone, but the server is in UTC, we send 14:00 UTC — which is wrong for the admin.

### 5.2 Approach

- **Store timezone per event** so we know how to interpret `startDate` + `startTime`.
- Add a nullable column, e.g. `events.timezone` (STRING, IANA timezone name, e.g. `'Europe/London'`, `'America/New_York'`).
- In the **event form**, add a timezone field:
  - Either a dropdown of common IANA zones, or
  - Default from a user preference (e.g. `User.timezone`) or from a site default in config (e.g. `config.defaultTimezone`), or from the browser (e.g. via a hidden field set by JS).
- When **creating or updating a Zoom meeting**, the Zoom gateway should:
  - Take `event.startDate`, `event.startTime`, and `event.timezone` (or fallback to a default).
  - Interpret the date and time **in that timezone** and convert to **UTC** (using a library such as `date-fns-tz`, `luxon`, or `dayjs` with timezone plugin).
  - Send to Zoom: `start_time: <that UTC instant in ISO 8601>`, and set Zoom’s `timezone` parameter to the IANA zone (Zoom supports this so the meeting shows in the correct zone in the Zoom UI).

Result: The time the admin enters (e.g. “14:00” in “Europe/London”) is what appears on Zoom and in join emails, with no server-timezone dependency.

### 5.3 Optional: User or Site Default Timezone

- If you add `User.timezone` or `config.defaultTimezone`, the event form can pre-fill `timezone` so the admin doesn’t have to choose every time. You can still allow overriding per event.

---

## 6. Implementation Order (Suggested)

1. **Timezone:** Add `events.timezone`, form field, and update Zoom gateway to convert local time to UTC using the event timezone. This fixes the visible time mismatch first.
2. **Sync status:** Include `EventMeeting` in events list, add **"Meeting link"** column with green tick / red dash (and Orphaned state when we have `eventStatus`).
3. **Event status:** Add `events.eventStatus` (`'active' | 'cancelled' | 'orphaned'`), default `'active'`. Use for orphaned (webhook) and cancelled (app-initiated) so front-end can exclude them.
4. **Sync:** Redirect Zoom OAuth callback to dashboard with flash; **auto-sync all events** after successful connection (no separate page). Add “Sync With Zoom” **only** on the Events page (below Add Event, greyed when Zoom not connected), POST to `.../events/sync-zoom`.
5. **Deletion flow (app-initiated):** Remove registrants from Zoom, delete Zoom meeting, **delete** Registration rows, refund orders, email users. If no orders → truly delete Event; if orders exist → set `eventStatus = 'cancelled'`. Confirmation modal.
6. **Zoom webhook:** Implement `POST /api/zoom/webhook`, handle `meeting.deleted`, set `eventStatus = 'orphaned'`. Admin: options to **re-sync** (new meeting + add all registrants) or **cancel** (delete Registrations, refund, notify; event cancelled if has orders, truly deleted if no orders). Modals for both.
7. **Email:** Add `emailService.sendEventCancellationEmail(...)` for cancellation/refund notifications.

---

## 7. Files and Areas to Touch (Summary)

| Area | Files / components |
|------|---------------------|
| Timezone | `events` migration (add `timezone`), Event model, event form (events.pug + validator), zoom.meeting.gateway (convert to UTC with timezone) |
| Sync status + “Meeting link” column | event.repo or event.service (include EventMeeting), eventTypeProducts.controller (pass meeting + eventStatus), events.pug (new column + badges, orphaned state) |
| Event status | Migration add `events.eventStatus`, Event model, default `'active'`; queries for storefront exclude non-active |
| Sync | zoom.controller (OAuth callback redirect to dashboard + flash; **auto-sync all events** after success), eventTypeProducts.controller (sync-zoom for this product’s events), routes (POST events/sync-zoom only); Events page button (below Add Event, greyed when Zoom not connected) |
| Deletion flow | event.service (cancel: unregister from Zoom, delete meeting, **delete** Registrations, refund, email, set cancelled or delete event), Zoom gateway (delete meeting, remove registrant if API exists), refund/Stripe, email.service (cancellation email), **confirmation modal** in events UI |
| Zoom webhook | New route (e.g. POST /api/zoom/webhook), handler set `eventStatus = 'orphaned'`; admin UI: re-sync (new meeting + add registrants) or cancel (delete Registrations, refund, notify; cancelled vs truly deleted by orders); **modals** for both |

---

## 8. Zoom Scopes and Webhook Setup

- **Current scopes** (from your docs): `meeting:write:meeting`, `user:read:user`, `meeting:write:registrant` (and optionally `meeting:write:batch_registrants`). For **deleting** a meeting via API when the admin deletes the event in the app, the same `meeting:write:meeting` scope is typically sufficient (Zoom allows delete with that scope). Confirm in Zoom’s scope list.
- **Webhook:** In the Zoom App Marketplace, configure the webhook URL (e.g. `https://yourdomain.com/api/zoom/webhook`), subscribe to **meeting.deleted**, and store the **verification token / secret** in config (e.g. `ZOOM_WEBHOOK_SECRET`) so the app can verify incoming requests.

---

## 9. Summary for Confirmation (check before implementation)

Use this section to confirm the flow and what will be implemented.

### Connect Zoom

- Admin goes to **Connect Zoom** in sidebar → OAuth with Zoom → redirect **back to dashboard** (no separate page).
- **Flash message** shows success or failure.
- **Auto-sync:** After successful connection, the app **automatically** creates Zoom meetings for all online events that don’t have one yet. Flash can include result (e.g. “Zoom connected. Created N meetings.”).

### Sync With Zoom button

- **Only** on the **Events page** (product events table), **below the Add Event** button.
- **Greyed out** when Zoom is not connected (tooltip e.g. “Connect Zoom first”).
- When active: syncs **this product’s** online events that don’t have a meeting yet. Redirect back to same page with flash.

### Meeting link column (Events table)

- Column header: **“Meeting link”**.
- **Synced:** green circle + tick (meeting created on Zoom).
- **Not synced (online):** red circle + dash (no meeting yet).
- **Orphaned:** distinct badge (Zoom meeting was deleted; event can be re-synced or cancelled).
- **Not online:** empty or “—”.

### Event status (lifecycle)

- **eventStatus:** `active` | `cancelled` | `orphaned` (stored on Event; used to exclude non-active from storefront and to drive UI).

### Admin deletes meeting on Zoom (webhook)

- Zoom sends `meeting.deleted` → app sets Event **orphaned**. (Meeting and its registrants are already gone on Zoom.)
- **Orphaned events:** admin can choose:
  - **Re-sync:** Create a **new** Zoom meeting, **add all existing registrants** (from DB) to it. Event becomes active again; no refunds; Registrations stay.
  - **Cancel:** **Delete** Registration rows, refund orders, notify users via email. **Orders stay** in the app. If event has orders → set `eventStatus = 'cancelled'` (shallow delete). If event has **no** orders → **truly delete** Event (and variant, EventMeeting).
- Modals to confirm re-sync and cancel.

### Admin deletes Event on app

- Remove registrants from Zoom (if meeting exists), delete Zoom meeting.
- **Delete** Registration rows (not just mark cancelled). Orders and OrderLines **stay** for history.
- Refund orders, notify users via email.
- If **no orders** → **truly delete** Event (and variant, EventMeeting). If **has orders** → set `eventStatus = 'cancelled'` (shallow delete; event and variant kept for integrity).
- Confirmation modal.

### Data integrity

- **Orders:** Never deleted. Admin sees all orders ever made.
- **Registrations:** **Deleted** when an event is cancelled (from app or when cancelling an orphaned event). Orders remain.
- **Events with orders:** Only **shallow delete** (cancelled). Events with no orders: can be **truly deleted**.

### Timezone

- Add `events.timezone` (IANA). Event form: timezone field. Zoom gateway: convert event date/time in that timezone to UTC when creating/updating the meeting.

---

Once you’re happy with this plan, we can implement it step by step in the order above (or in an order you prefer).
