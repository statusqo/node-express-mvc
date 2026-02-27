# Webinar Checkout Flow – Implementation Plan

**Status:** Plan only. No code changes until approved.

This document describes a **production-ready plan** to give Webinars a **dedicated checkout flow** separate from the generic cart checkout, and to enrich the webinar detail page with Media, outcomes, certificates, and a clear "Book Now" → checkout journey.

---

## 1. Current State Summary

| What | Where | Notes |
|------|--------|--------|
| Webinar list | `GET /webinars` | Renders `web/webinars/index.pug` |
| Webinar detail | `GET /webinars/:slug` | Renders `web/webinars/show.pug` – title, description, price, sessions list, "Book a session" link |
| Webinar checkout | `GET/POST /webinars/:slug/buy` | Buy form (choose event, email/name), then `orderService.createOrderFromWebinarEvent` → Stripe Checkout Session → redirect to `/orders/:id` |
| Cart checkout | `GET/POST /checkout` | Cart-based; address, payment; order from cart |
| Models | `Webinar` (productId), `Event` (webinarId, productVariantId) | Product/Variant created automatically; orders use OrderLine from variant snapshot |

**Flow already in place:** List → Show → "Book a session" → `/webinars/:slug/buy` → choose session + details → Continue to payment → Stripe → `/orders/:id`. No cart involved for this path.

---

## 2. Goals (What We Want)

1. **Clear separation of flows**
   - **Regular products:** Add to cart → `/cart` → `/checkout` → payment → order.
   - **Webinars:** Browse `/webinars` → open webinar `/webinars/:slug` → "Book Now" → **webinar checkout page** (no cart) → payment → order.

2. **Webinar detail page** (`/webinars/:slug`) to show:
   - Title, description, price (already present).
   - **Media** (images) – e.g. from Product’s meta objects or a future Media model.
   - **Outcomes** and **Certificates** – e.g. meta object types or structured fields.
   - Sessions list and a clear **Book Now** CTA to the webinar checkout URL.

3. **Webinar checkout URL**
   - Current: `/webinars/:slug/buy`.
   - Alternative names (pick one and stick to it):
     - **`/book`** – Short, implies “book a slot.”
     - **`/register`** – Common for events/training.
     - **`/reserve`** – Implies reserving a place.
   - Recommendation: keep **`/buy`** for consistency with existing code and EVENT_OFFERINGS plan, or switch to **`/register`** if you want event-specific wording. No functional change required for the URL path.

4. **Production quality**
   - Validation, authorization, security (CSRF, rate limiting where appropriate), clear errors, no mixing of cart and webinar flows in the same step.

---

## 3. Scope: What Changes vs What Stays

| Area | Change? | Description |
|------|---------|-------------|
| Routes | Optional rename | Keep `/:slug/buy` or add alias `/:slug/register` (or replace). |
| Webinar **show** page | **Yes** | Enrich with Media (if available), outcomes, certificates; make CTA "Book Now" and point to chosen checkout path. |
| Webinar **checkout** page | **Yes** | Ensure it’s clearly the “webinar checkout” (copy, layout, no cart UI); optional: support Stripe Payment Element on same page (later phase). |
| Cart | **No** | Webinar flow does not use cart. Optionally: prevent or discourage adding webinar variants from generic product page; document that webinar purchases use `/webinars/:slug/buy`. |
| Order creation | **No** | `createOrderFromWebinarEvent` stays; already correct. |
| Payment | **No** | Same gateway (e.g. Stripe Checkout Session); success/cancel URLs stay `/orders/:id`. |

---

## 4. Implementation Plan (Step-by-Step)

### Phase 1: URL and routing (optional)

- **1.1** Decide canonical path: **`/webinars/:slug/buy`** (current) or **`/webinars/:slug/register`** (or `/book`).
- **1.2** If renaming: in `src/routes/web/webinars.routes.js`, change route from `/:slug/buy` to the chosen path; update all links in views and any redirects (e.g. in `webinars.controller.js`: redirects to `"/webinars/" + slug + "/buy"` → new path).
- **1.3** Ensure route order remains: more specific before generic (e.g. `GET /`, `GET /:slug/buy` or `/:slug/register`, then `GET /:slug`).

No new routes are strictly required; this phase is naming only.

---

### Phase 2: Webinar detail page – data (backend)

**2.1 – Load Product and Meta for show**

- **Controller:** In `webinars.controller.show`, after `webinarService.findBySlug(slug)`, load the **Product** for this webinar (via `webinar.productId`).
- **Service/Repo:** Add a method that returns webinar with Product included and Product’s **meta objects** (MetaObject + ProductMetaObject join with `values` so the view can show key/value meta). Reuse existing Product ↔ MetaObject association; no new models.
- **Product meta:** Use MetaObject **type** or **slug** to distinguish “outcomes”, “certificates”, “images” (or similar). If “Media” is “images”, they can be stored as meta object instances (e.g. type `image`, value URL or asset key). No “Media” model exists today; the plan assumes either:
  - **Option A:** Use Product’s existing MetaObjects to represent outcomes, certificates, and image URLs (recommended for minimal change).
  - **Option B:** Later introduce a dedicated Media model and link to Product (or Webinar); then the show page would load Media and display a gallery.

**2.2 – Outcomes and certificates**

- If stored as **MetaObjects** on the Product (e.g. type `outcomes`, `certificate`), the webinar show action already gets them when loading Product with meta objects. View renders by type/slug.
- If you prefer **first-class fields** on Webinar (e.g. `outcomes` TEXT, `certificateInfo` TEXT), add a migration and extend `Webinar` model and admin form; then show them on the public show page. Plan recommends MetaObjects for flexibility unless you want simple text-only fields.

**Deliverables (Phase 2):**

- `webinar.repo.js`: e.g. `findBySlugWithProductAndMeta(slug)` or use existing `findBySlug` with `include: [Product, Product.metaObjects]` (via Product include with MetaObject + ProductMetaObject).
- `webinars.controller.js` (web): in `show`, pass `webinar`, `product`, `metaObjects` (or equivalent) and optionally `outcomes`, `certificates` (derived from meta or from Webinar fields).
- No change to order or cart logic.

---

### Phase 3: Webinar detail page – view (front-end)

- **3.1** In `web/webinars/show.pug`:
  - Keep title, description, price.
  - Add a **Media / images** block: if Product has meta (or Media) for images, render a small gallery or hero image.
  - Add **Outcomes** section: render from meta type “outcomes” or from Webinar field.
  - Add **Certificates** section: render from meta type “certificate” or from Webinar field.
  - Keep sessions list; change link text to **“Book Now”** and set `href` to `/webinars/:slug/buy` (or chosen path).
- **3.2** Ensure responsive layout and accessibility (alt text for images, headings hierarchy).

---

### Phase 4: Webinar checkout page – clarity and validation

- **4.1** **Copy and layout:** In `web/webinars/buy.pug`, make it explicit that this is “Webinar checkout” or “Book your place” (not the generic site checkout). Optionally reuse layout patterns from main checkout (e.g. order summary, one column form) without cart UI.
- **4.2** **Validation (already in place):** `webinarBuy.schema.js` validates `eventId` (UUID), `email`, `forename`, `surname`. Keep validation in controller before calling `createOrderFromWebinarEvent`; return 400/redirect with flash on error.
- **4.3** **Security:**
  - **CSRF:** If the app uses CSRF for other POST forms (e.g. checkout, cart add), add the same CSRF token to the webinar buy form and validate it on POST. (No CSRF middleware was found in web routes; recommend adding for all state-changing POSTs in a separate security pass.)
  - **Event ownership:** Already enforced: controller loads webinar by slug, validates that `eventId` belongs to that webinar (`event.webinarId === webinar.id`). No change needed.
  - **Rate limiting:** Optional: rate-limit POST `/webinars/:slug/buy` by IP or session to prevent abuse (e.g. express-rate-limit). Document in plan; implement in a single place for all checkout-like endpoints if desired.
- **4.4** **Guest vs user:** Keep current behavior: guest can book with email; logged-in user can have email prefilled. No change required.

---

### Phase 5: Cart vs webinar (policy and optional guard)

- **5.1** **Policy:** Document that the **primary** way to purchase a webinar is: `/webinars` → `/webinars/:slug` → “Book Now” → `/webinars/:slug/buy` → payment. Cart is for regular products only (or for mixed carts if you later allow it).
- **5.2** **Optional:** If the Product for a webinar is still reachable at `/products/:slug` (e.g. `webinar-infekcije`), you can:
  - **Option A:** Do nothing (user can add to cart; at checkout they see the line; no conflict).
  - **Option B:** In product controller or add-to-cart handler, detect product type “webinar” and redirect to `/webinars/:webinarSlug/buy` with a message “To book this webinar, use the link below,” or simply hide webinar products from the main product listing so they’re only reachable via `/webinars`.

Recommendation: **Option B** (hide or redirect) so there is a single, clear path for webinars and no confusion with cart checkout.

---

### Phase 6: Order confirmation and order detail

- **6.1** After payment, user is already redirected to `/orders/:id`. No change.
- **6.2** On the order detail view, lines that come from a webinar event (ProductVariant linked to an Event) can be displayed with event info (e.g. “Webinar: Infekcije – 2025-03-15 10:00”). This may already be possible by resolving Variant → Event; if not, add a small helper in order.service or in the view to show “Webinar / Event date” for such lines. Optional enhancement; not blocking for the “different checkout flow” goal.

---

## 5. Request/Response Flow (Recap)

- **List:** `GET /webinars` → `webinars.controller.index` → `webinar.service.findAll` → `webinar.repo.findAll` → render `web/webinars/index`.
- **Detail:** `GET /webinars/:slug` → `webinars.controller.show` → `webinar.service.findBySlug` (with Product + meta) → `webinar.repo` (+ product.repo / meta if needed) → render `web/webinars/show` (with Media, outcomes, certificates, “Book Now”).
- **Checkout (GET):** `GET /webinars/:slug/buy` → `webinars.controller.buyForm` → `webinar.service.findBySlug`, `event.service.findByWebinar` → render `web/webinars/buy`.
- **Checkout (POST):** `POST /webinars/:slug/buy` → validate body → `webinars.controller.buy` → `orderService.createOrderFromWebinarEvent` → gateway `createCheckoutSession` → redirect to Stripe → success → `/orders/:id`.

All layers: **Routes → Controllers → Services → Repos → Models.** No logic in routes; validation and ownership checks in controller/service.

---

## 6. Security Checklist

| Item | Action |
|------|--------|
| Event belongs to webinar | Already enforced in controller (event.webinarId === webinar.id). |
| Webinar active and exists | Already checked before showing buy form and before POST. |
| Input validation | webinarBuy.schema (eventId, email, forename, surname). |
| Guest email | Required when not logged in; already validated. |
| CSRF | Add to all POST forms (webinar buy, checkout, cart add) if not already present. |
| Rate limiting | Optional on POST `/webinars/:slug/buy` and `/checkout`. |
| No cart mixing | Webinar flow never reads or writes cart; order is created only from event. |

---

## 7. File Checklist (Summary)

| Phase | File(s) | Action |
|-------|---------|--------|
| 1 | `src/routes/web/webinars.routes.js` | Optional: rename `/:slug/buy` to `/:slug/register` (or keep). |
| 1 | `src/controllers/web/webinars.controller.js`, `web/webinars/show.pug`, `web/webinars/buy.pug` | Update links/redirects if URL renamed. |
| 2 | `src/repos/webinar.repo.js` (or product.repo) | Add/include Product + MetaObjects for webinar by slug. |
| 2 | `src/services/webinar.service.js` | Optional: method that returns webinar with Product and meta for public show. |
| 2 | `src/controllers/web/webinars.controller.js` | In `show`, load and pass Product, meta (outcomes, certificates, images). |
| 3 | `src/views/web/webinars/show.pug` | Add Media, outcomes, certificates; “Book Now” CTA. |
| 4 | `src/views/web/webinars/buy.pug` | Clarify copy (“Webinar checkout”); add CSRF if app-wide CSRF is added. |
| 4 | App-wide | Consider CSRF middleware and optional rate limiting for checkout-like routes. |
| 5 | `src/controllers/web/products.controller.js` or cart add | Optional: redirect or hide webinar products from main product flow. |
| 6 | `src/views/web/order.pug` (or equivalent) | Optional: show “Webinar / Event” for order lines that are webinar events. |

---

## 8. Production Readiness Notes

- **Transactions:** Order creation already uses a transaction in `createOrderFromWebinarEvent` (order + line). No change.
- **Errors:** Use flash messages and redirects for validation/ownership failures; avoid leaking internal errors to the client.
- **Logging:** Existing Stripe gateway logging is sufficient; optional: log webinar booking attempts (slug, eventId, guest vs user) for analytics and support.
- **Idempotency:** Stripe Checkout Session is created per order; duplicate submissions create multiple orders. Optional: for same (user/session + webinar + event), reject or show “You already have a pending order for this session” if a recent pending order exists. Can be a follow-up.

---

## 9. Summary

- **Webinars** keep a **dedicated checkout flow**: list → detail → “Book Now” → `/webinars/:slug/buy` (or `/register`) → payment → `/orders/:id`. No cart.
- **Detail page** is enriched with Media (via Product meta or future Media model), outcomes, and certificates; CTA is “Book Now.”
- **URL** can stay `/buy` or be renamed to `/register` (or `/book`) for wording only.
- **Security:** Validation and event–webinar ownership are in place; add CSRF and optional rate limiting for production.
- **Optional:** Prefer single path for webinars by hiding or redirecting webinar products from main product/cart flow and optionally improving order detail view for webinar lines.

No code has been changed; this plan is for review and approval before implementation.
