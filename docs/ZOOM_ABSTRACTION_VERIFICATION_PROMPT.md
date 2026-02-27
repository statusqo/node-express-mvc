# Prompt: Verify Zoom Integration Abstraction

**Use this prompt with a new Cursor agent to audit the Zoom integration and ensure it is correctly abstracted. The outcome is critical: users must be able to attend the online events they paid for.**

---

## Your task

1. **Check that the Zoom integration is correctly abstracted** so that core application code uses only a thin meeting-provider interface. Zoom must be a “light wrapper” behind that interface; core models and services must remain intact and must not depend on Zoom-specific types.
2. **Verify the end-to-end flow** so that when a customer pays for an online event, they are registered with the meeting provider (e.g. Zoom) and can attend the event.

---

## Reference pattern: How Stripe is integrated

Use the **payment gateway** pattern as the model for how Zoom should be integrated:

- **Single entry point:** `src/gateways/index.js` exposes `getGateway(name)` / `getDefaultGateway()`. Controllers and services never `require("stripe")` or `require("./stripe.gateway")` directly; they obtain the gateway via this factory.
- **Interface, not implementation:** `src/gateways/interface.js` defines the payment gateway contract (e.g. `createPaymentIntent`, `validatePaymentIntent`). Core code calls methods on “the gateway” returned by the factory, not Stripe-specific APIs.
- **Implementation in one place:** `src/gateways/stripe.gateway.js` implements that interface using the Stripe SDK and Stripe-specific config. All Stripe types and API calls stay inside this file (and the Stripe webhook controller).
- **Core stays clean:** Order service, checkout controller, etc. use `getDefaultGateway()` and then call `gateway.createPaymentIntentForOrder(...)`. They do **not** import Stripe, use `stripePaymentIntentId` in business logic beyond passing it to the gateway, or depend on Stripe-specific models in a way that would block adding another payment provider.

Apply the same idea to **meeting providers**: one factory, one interface, one (or more) implementations. Core talks only to the interface.

---

## What “correctly abstracted” Zoom means

- **Meeting provider factory:** There is a single entry point (e.g. `getMeetingProvider()` in `src/gateways/meeting.interface.js`) that returns the configured meeting provider implementation (e.g. Zoom) or `null`. Core code uses only this entry point to get “the meeting provider.”
- **Meeting provider interface:** The interface defines at least:
  - **createMeeting(event, userId)** → creates a meeting for an online event; the **provider** resolves the host account from `userId` (e.g. Zoom loads `AdminZoomAccount` by `userId`). Core never loads or passes Zoom tokens or Zoom account models.
  - **addRegistrant(meeting, registration)** → adds a registrant to the meeting; the **provider** resolves the host token from the `meeting` object (e.g. via `meeting.hostAccountId`). Core never fetches or passes access tokens.
- **Zoom as a light wrapper:** All Zoom-specific code (Zoom API calls, `AdminZoomAccount` model usage, Zoom OAuth) lives in:
  - `src/gateways/zoom.meeting.gateway.js` (createMeeting, addRegistrant),
  - `src/controllers/admin/zoom.controller.js` (OAuth “Connect Zoom” flow).
- **Core models and services stay intact:**  
  - **No Zoom types in core:** `src/services/order.service.js` and `src/services/event.service.js` must **not** `require` or use `AdminZoomAccount` or any Zoom-specific module. They may use generic models such as `Event`, `EventMeeting`, `Registration`, and the meeting provider interface only.  
  - **EventMeeting** can have provider-specific storage (e.g. generic `hostAccountId`); the **resolution** of that id to tokens and API calls must happen inside the Zoom gateway, not in order or event services.

If core services import `AdminZoomAccount` or pass tokens/host accounts into the meeting provider, the abstraction is broken.

---

## Critical user flow to verify

**Users must attend the event they paid for.** Confirm this path works:

1. **Admin:** Creates an online event (e.g. webinar) with “Online” checked, and has connected Zoom via “Connect Zoom” in admin.  
   → A meeting is created with the meeting provider (Zoom) and an `EventMeeting` row is stored (e.g. `eventId`, `providerMeetingId`, `joinUrl`, `hostAccountId`).

2. **Customer:** Pays for the event (e.g. via Stripe).  
   → On payment success, `recordPaymentSuccess` runs.

3. **Registration:** For each order line with an `eventId`, a **Registration** is created (eventId, orderLineId, email, forename, surname, status).  
   → If the event is online and has an `EventMeeting`, the code must call the meeting provider’s **addRegistrant(meeting, registration)** so the attendee is registered with Zoom (or the active provider).  
   → The Registration should store any provider-returned id (e.g. `providerRegistrantId`) if the provider returns one.

4. **Attendance:** Zoom (or the provider) sends confirmation/reminder emails to the registrant; the registrant uses the meeting link to join.  
   → No step in this flow should be skipped because of a missing or incorrect call to the meeting provider (e.g. core must not depend on Zoom-specific logic that could be missing when only the interface is used).

Check that:
- Order service creates Registrations for event order lines.
- Order service calls the meeting provider’s `addRegistrant(meeting, registration)` for online events with a meeting, **without** core ever resolving Zoom tokens or loading `AdminZoomAccount`.
- The Zoom gateway’s `addRegistrant` resolves the host token from `meeting` (e.g. `meeting.hostAccountId` → load account → use `accessToken`) and calls the Zoom API to add the registrant.

---

## Files to inspect

- **Meeting abstraction:**  
  `src/gateways/meeting.interface.js` — factory and interface documentation.  
  `src/gateways/zoom.meeting.gateway.js` — Zoom implementation; should be the only place that uses Zoom API and `AdminZoomAccount` for meeting/registrant operations.

- **Core services (must stay Zoom-agnostic):**  
  `src/services/order.service.js` — especially `recordPaymentSuccess`: Registration creation and call to meeting provider’s `addRegistrant`.  
  `src/services/event.service.js` — especially `ensureMeetingForOnlineEvent`: should call `provider.createMeeting(event, userId)` and create `EventMeeting` from the result; must not load `AdminZoomAccount`.

- **Stripe reference:**  
  `src/gateways/index.js` — how `getGateway` / `getDefaultGateway()` are used.  
  `src/gateways/interface.js` — payment gateway interface.  
  Controllers that use `getDefaultGateway()` and call methods on the returned gateway (no direct Stripe in core).

- **Zoom OAuth (allowed to be Zoom-specific):**  
  `src/controllers/admin/zoom.controller.js` — “Connect Zoom” and callback; may use `AdminZoomAccount` and Zoom OAuth.

---

## Summary checklist for the agent

- [ ] Core services (`order.service.js`, `event.service.js`) do **not** import or use `AdminZoomAccount` or any Zoom-only module.
- [ ] Core obtains the meeting provider only via `getMeetingProvider()` and calls only `createMeeting(event, userId)` and `addRegistrant(meeting, registration)`.
- [ ] Host credentials (tokens, Zoom account lookup) are resolved **inside** the Zoom gateway (and Zoom OAuth controller), not in order or event services.
- [ ] On payment success for an event order line, Registrations are created and `addRegistrant(meeting, registration)` is invoked for online events with a meeting, so users can attend the event they paid for.
- [ ] The pattern mirrors the Stripe integration: light wrapper behind an interface, core models and flows intact.

If any of the above fails, fix the code so that Zoom remains a light wrapper and the critical path (pay → register with provider → attend) is correct and reliable.
