# Event Checkout On-Page Plan (Webinars, Seminars, Classrooms)

**Status:** Implemented (event checkout on-page with Stripe Elements; GET /register, POST /place-order; cart checkout confirm-order reused).

This document describes how to change the **event buy flow** so that users **stay on-site** and pay with **Stripe Elements** (same pattern as cart checkout), and how to add **Add to cart** alongside **Register now** on event product pages. It also clarifies how the Stripe gateway is used for both Cart and Event checkout so the implementation stays modular.

---

## 1. Goals

1. **No redirect to Stripe Checkout** for event purchases. Users pay on a dedicated register page using Stripe Elements (card field on our site).
2. **Event checkout mirrors cart checkout** in flow: create order → create PaymentIntent for that order → client confirms card → server confirms order (and webhook as backup).
3. **Detail page options:** On `/webinars/:slug` (and seminars/classrooms), the user can either **Add to cart** (continue shopping) or **Register now** (go to event checkout page and pay with card).
4. **Stripe gateway stays modular:** One gateway implementation supports both Cart checkout and Event checkout; only the entry point and UI differ. Remove use of `createCheckoutSession` for events.
5. **Remove** all code paths that send the customer to Stripe’s hosted checkout for event purchases.

---

## 2. Current vs Desired Flow

### Current event flow (to be changed)

- User: `/webinars` → `/webinars/:slug` → “Book a session” → **`/webinars/:slug/buy`**
- On buy page: choose session, enter email/name, submit → **POST `/webinars/:slug/buy`**
- Server: `createOrderFromEvent()` → **`createCheckoutSession(order.id)`** → **redirect to Stripe Checkout URL**
- User pays on Stripe’s page → redirect to `/orders/:id`. Webhook marks order paid.

### Desired event flow

- User: `/webinars` → `/webinars/:slug` (detail page).
- **Option A – Add to cart:** Click “Add to cart” for a session → variant added to cart (existing cart API). User can continue to other pages or go to `/cart` → `/checkout` (cart checkout).
- **Option B – Register now:** Click “Register now” → **`/webinars/:slug/register`** (event checkout page).
- On register page: choose session (if multiple), enter email/name, enter card via **Stripe Elements**, click “Pay”.
- **Step 1 (server):** POST to an event **place-order** endpoint → server creates order from event + **`createPaymentIntentForOrder(order.id)`** → returns `{ clientSecret, orderId }`.
- **Step 2 (client):** `stripe.confirmCardPayment(clientSecret, ...)`.
- **Step 3 (server):** On success, client POSTs to **confirm-order** (shared with cart) with `paymentIntentId`, `orderId` → server validates PaymentIntent, calls `recordPaymentSuccess`, optionally saves card → returns `{ orderId }`; client redirects to `/orders/:orderId`.
- **Webhook:** `payment_intent.succeeded` (and optionally confirm-order) marks order paid; no redirect to Stripe.

---

## 3. URL and Route Summary

| Purpose | Current | Desired |
|--------|--------|--------|
| Event product detail | `GET /webinars/:slug` | Unchanged |
| Event checkout page (form + card) | `GET /webinars/:slug/buy` | **`GET /webinars/:slug/register`** (rename or new; recommend **register**) |
| Event checkout submit (redirect to Stripe) | `POST /webinars/:slug/buy` | **Removed** (no more redirect) |
| Event place-order (create order + PaymentIntent, return JSON) | — | **`POST /webinars/:slug/place-order`** (or under a shared path; see below) |
| Confirm payment (mark order paid) | `POST /checkout/confirm-order` | **Reuse** for both cart and event (same `orderId` + `paymentIntentId` flow) |

Apply the same URL pattern for **seminars** and **classrooms** (e.g. `GET/POST /seminars/:slug/register`, `POST /seminars/:slug/place-order`, etc.).

**Recommendation:** Use **`/register`** for the event checkout page (and reserve **`/buy`** for redirect or remove it) so the wording is “Register now” and the path is `/webinars/:slug/register`.

---

## 4. Detail Page: Add to Cart + Register Now

**File:** `src/views/web/event-type-products/show.pug` (and same structure for any shared partial).

- **Sessions list:** Keep listing sessions (date, time, location, capacity). For each session we have `ev.id` (event id) and `ev.productVariantId` (for cart).
- **Add to cart (per session):** For each event that has `productVariantId`, render a small form or button that adds that variant to the cart:
  - Form with `class="js-add-to-cart-form"`, `action="/cart/add"` (or use existing API from `add-to-cart.js`), hidden `input name="productVariantId" value=ev.productVariantId`, `quantity=1`. Existing `add-to-cart.js` will intercept and call `POST /api/cart/add` with `{ productVariantId, quantity }`. So we need to ensure the event type show view includes the same layout/script as product pages so `add-to-cart.js` runs, and use the same form pattern.
- **Register now:** One clear CTA (e.g. “Register now” or “Book with card”) that links to **`/webinars/:slug/register`** (or `/seminars/:slug/register`, `/classrooms/:slug/register`). No form post to Stripe; just a link.
- Remove or repurpose the old “Book a session” link that went to `/buy`; replace with “Register now” → `/register` and per-session “Add to cart”.

---

## 5. Event Register Page (GET)

**Route:** `GET /webinars/:slug/register` (and same for seminars/classrooms).

- **Controller:** Reuse the same pattern as current `buyForm`: load product by slug, validate type (webinar/seminar/classroom), load events with `productVariantId`, return view with `product`, `events`, `sectionPath`, `typeLabel`, and **`stripePublishableKey`** (for Elements).
- **View:** New template (e.g. `event-type-products/register.pug`) that:
  - Shows product title and single-line summary/price.
  - **Session selection:** If multiple events, radio buttons (or dropdown) with `eventId` (and optionally display variant/price per session).
  - **Contact fields:** Email (required for guest), forename, surname (optional). No delivery/billing address.
  - **Payment:** Stripe Card Element container (`#card-element`), optional “Save this card” for logged-in users, and optional saved-card selector if we support it for events (can match cart checkout).
  - **Submit button:** “Pay” or “Complete registration”.
  - Form does **not** submit traditionally; it is handled by JS: collect eventId + contact, call **POST place-order**, then `confirmCardPayment`, then **POST confirm-order** with `paymentIntentId` and `orderId`.
- **Script:** New JS (e.g. `event-register.js` or shared “payment form” module) that:
  - Loads Stripe with publishable key.
  - Mounts Card Element (and optionally saved-card UI).
  - On “Pay” click: validate session + email, POST to event **place-order** URL with form data (eventId, email, forename, surname, optional paymentMethodId if saved card), get `clientSecret` and `orderId`, then `stripe.confirmCardPayment(clientSecret, ...)`, then POST to **confirm-order** with `paymentIntentId`, `orderId`, and save-card flag, then redirect to `/orders/:orderId`.

---

## 6. Event Place-Order Endpoint (Backend)

**Route:** `POST /webinars/:slug/place-order` (and same for seminars/classrooms). Alternatively, a single shared route such as `POST /api/event-checkout/place-order` with body containing `productSlug`, `sectionPath` or `typeSlug`, and `eventId` (to avoid three identical handlers). Plan assumes **per-section routes** for clarity: `POST /webinars/:slug/place-order`, `POST /seminars/:slug/place-order`, `POST /classrooms/:slug/place-order`.

**Behavior:**

1. **Resolve product and event:** Load product by slug and section (webinar/seminar/classroom). Validate `eventId` from body belongs to this product (same as current buy validation).
2. **Validate input:** Use existing or extended validator (e.g. `validateWebinarBuy` or a shared `validateEventRegister`) for eventId, email, forename, surname. Require email for guest.
3. **Create order:** `orderService.createOrderFromEvent(eventId, userId, sessionId, { email, forename, surname })`.
4. **Create PaymentIntent:** `getDefaultGateway().createPaymentIntentForOrder(order.id, userId, sessionId, { email, paymentMethodId? })`. Same as cart: gateway returns `{ clientSecret }`.
5. **Response:** JSON `{ clientSecret, orderId }`. No redirect.

**No** call to `createCheckoutSession` anywhere in this path.

---

## 7. Reuse of Confirm-Order (Cart + Event)

**Existing:** `POST /checkout/confirm-order` expects `paymentIntentId`, `orderId`, form fields (for save-card), and optional `saveCard` / `paymentMethodId`. It validates the PaymentIntent, loads the order (by orderId and userId/sessionId), finds the transaction by `gatewayReference === paymentIntentId`, and calls `orderService.recordPaymentSuccess(transaction.id, order.userId)`.

**Plan:** Use this **same endpoint** for event checkout. After the client confirms the card payment, it sends `paymentIntentId`, `orderId`, and the same optional fields. No need for a separate event confirm-order route. Ensure the order was created with the same `userId`/`sessionId` so ownership check passes.

---

## 8. Stripe Gateway: Modular Use (No Code Change to Gateway)

The existing Stripe gateway already supports both flows:

- **Cart checkout:** Create order from cart → `createPaymentIntentForOrder(order.id, ...)` → client confirms → confirm-order. No Checkout Session.
- **Event checkout:** Create order from event → **same** `createPaymentIntentForOrder(order.id, ...)` → client confirms → **same** confirm-order.

**Changes are only at the call site:**

- **Event controller:** Do **not** call `createCheckoutSession` for event purchases. Call only `createPaymentIntentForOrder` after `createOrderFromEvent`.
- **Cart “pay later” from order page:** The existing `payOrder` (e.g. GET `/orders/:id` with `?pay=1` → redirect to Stripe Checkout) can remain as-is for now (optional: later you could replace that with an on-page PaymentIntent flow too).

So the gateway stays **modular** in the sense that:

- **PaymentIntent + Elements** = used for both Cart checkout and Event checkout (on-site).
- **Checkout Session (redirect)** = used only where you explicitly want redirect (e.g. pay from order page), **not** for the main event or cart checkout flows.

No new gateway methods are required; we only remove the event flow’s use of `createCheckoutSession`.

---

## 9. Code to Remove or Change

| Location | Action |
|---------|--------|
| `eventTypeProducts.controller.buy` (POST) | Remove call to `gateway.createCheckoutSession` and redirect to Stripe. Replace with: either remove this action and use GET register + POST place-order only, or repurpose POST `buy` to redirect to register page (not recommended; cleaner to have GET register + POST place-order). So: **remove** the current POST `buy` body that creates order and redirects to Stripe. |
| Routes: `POST /webinars/:slug/buy` (and seminars/classrooms) | Remove or repurpose. Recommended: **remove** POST `/buy` and use **GET `/register`** + **POST `/:slug/place-order`** only. So old `POST .../buy` is deleted. |
| Link "Book a session" → `/buy` | Change to "Register now" → `/register`. Add "Add to cart" per session on detail page. |
| Old buy view `event-type-products/buy.pug` | Replace with new **register** view (form + Stripe Elements container, no full-page submit to Stripe). |

---

## 10. New and Updated Pieces

| Item | Description |
|------|-------------|
| **GET** `/:slug/register` | New route; show register form (session choice, contact, Stripe Elements container). Reuse logic from current buyForm for product/events loading; add stripePublishableKey. |
| **POST** `/:slug/place-order` | New route; validate eventId + contact, createOrderFromEvent, createPaymentIntentForOrder, return { clientSecret, orderId }. |
| **View** `event-type-products/register.pug` | New template: session selection, contact fields, card element div, Pay button, no delivery/billing. |
| **Script** `event-register.js` (or similar) | New JS: Stripe Elements, submit → POST place-order → confirmCardPayment → POST confirm-order → redirect to /orders/:orderId. Include only on register page (and load Stripe.js when stripePublishableKey present). |
| **Detail page** `show.pug` | Add per-session “Add to cart” (form with productVariantId); change “Book a session” to “Register now” linking to `/register`. |
| **Validator** | Reuse `validateWebinarBuy` (or rename to `validateEventRegister`) for eventId, email, forename, surname; use in both register page (if ever server-rendered validation) and place-order. |

---

## 11. Validation and Security

- **Event ownership:** In place-order, ensure the selected `eventId` belongs to the product identified by `:slug` and the correct section (webinar/seminar/classroom). Same as current buy.
- **CSRF:** Include CSRF token in register form and in place-order/confirm-order requests if the app uses CSRF elsewhere.
- **Rate limiting:** Apply same (or similar) limits as cart checkout to POST place-order and confirm-order.
- **Email:** Required for guest; optional for logged-in user (can default from account).

---

## 12. Webhook and Order State

- **payment_intent.succeeded:** Already finds order by `stripePaymentIntentId` and calls `recordPaymentSuccess`. No change. Event orders created with `createOrderFromEvent` and paid via `createPaymentIntentForOrder` will have `stripePaymentIntentId` and a transaction, so webhook will mark them paid if the client doesn’t call confirm-order first.
- **checkout.session.completed:** No longer used for event flow. Can remain for any remaining “pay from order page” redirect flow.

---

## 13. File Checklist (Summary)

| Phase | File(s) | Action |
|-------|---------|--------|
| Routes | `webinars.routes.js`, `seminars.routes.js`, `classrooms.routes.js` | Add GET `/:slug/register`, POST `/:slug/place-order`. Remove or keep POST `/:slug/buy` (recommend remove; or 302 to register). |
| Controller | `eventTypeProducts.controller.js` (web) | Add `registerForm` (GET register page), `placeOrder` (POST place-order). In `buy` (POST): remove createCheckoutSession + redirect; remove or redirect to register. |
| Views | `event-type-products/show.pug` | Add “Add to cart” per session (form + productVariantId). Change “Book a session” to “Register now” → `/register`. |
| Views | `event-type-products/register.pug` | New: session selection, contact, card element container, Pay button. |
| Views | `event-type-products/buy.pug` | Remove or redirect to register; recommend delete once register is in place. |
| Scripts | New `event-register.js` (or under `public/js/`) | Stripe Elements, place-order fetch, confirmCardPayment, confirm-order fetch, redirect. |
| Layout / scripts | Register template | Include Stripe.js when key present; include `event-register.js`. |
| Gateway | `stripe.gateway.js` | No API change; only stop using createCheckoutSession for event flow in controller. |
| Validator | `webinarBuy.schema.js` (or new name) | Use same validation for place-order (eventId, email, forename, surname). |

---

## 14. Optional: Shared Place-Order Path

To avoid three identical handlers (webinars, seminars, classrooms), you can:

- Expose **one** route, e.g. `POST /api/event-checkout/place-order`, with body `{ productSlug, typeSlug, eventId, email, forename, surname, paymentMethodId? }`, and resolve product by `typeSlug` + `productSlug`. Then the register page JS calls this single URL with `typeSlug: 'webinar'` (or seminar/classroom). This is an implementation detail; the plan above works with either per-section or shared API.

---

## 15. Summary

- **Detail page:** Add “Add to cart” per session (using existing cart API) and “Register now” → `/webinars/:slug/register` (and same for seminars/classrooms).
- **Event checkout:** GET `/register` shows form + Stripe Elements; user pays on-site. POST **place-order** creates order from event + PaymentIntent, returns `clientSecret` and `orderId`. Client confirms card then POSTs to **confirm-order** (shared with cart). Webhook continues to handle `payment_intent.succeeded`.
- **Stripe:** No redirect to Stripe Checkout for events; only PaymentIntent + Elements. Gateway unchanged; event controller stops calling `createCheckoutSession` for event purchases.
- **Removed:** Current POST `.../buy` that creates order and redirects to Stripe; old buy view replaced by register view.

No code has been changed; this plan is for review and approval before implementation.
