# Event-Based Offerings (Webinars, Classrooms, Seminars) – Implementation Plan

This document is a **step-by-step implementation plan** for adding event-based offerings (Webinars first, then Classrooms/Seminars) with automatic Product and ProductVariant creation, so admins work with "Webinar + Events" while the ecommerce core (Cart/Order = ProductVariant) stays unchanged. The plan follows **Routes → Controllers → Services → Repos → Models** and production-grade patterns used in the codebase.

---

## 1. Overview

### 1.1 Goals

- **Admin** creates a **Webinar** (title, slug, description, price) → system **automatically creates a Product** (productTypeId = webinar, no default variant).
- **Admin** adds an **Event** to a Webinar (startDate, startTime, endDate, location, capacity) → system **automatically creates a ProductVariant** (and ProductPrice) for that Webinar’s product and links Event to it.
- Admin thinks in terms of **Webinar** and **Events**; Product and ProductVariant are created by fixed rules, reducing duplicate work.
- **Public** can list webinars (`/webinars`), view a webinar and its events (`/webinars/:slug`), and add an event slot to cart (add the corresponding ProductVariant).
- **Extensibility**: Same pattern for Classroom and Seminar later (separate models or unified Offering + type).
- **Calendar**: Event model (startDate, startTime, endDate) is ready for future iCal/calendar integration.
- **Checkout**: **Different checkout flows per offering type**: e.g. purchase at **/webinars/:slug/buy** (or /webinars/infekcije/buy) instead of generic /checkout; after payment user is routed to **/orders/:orderId**. Same idea for classrooms, seminars (e.g. /classrooms/:slug/buy, /seminars/:slug/buy).

### 1.2 Architecture Summary

| Layer       | New/Updated |
|------------|-------------|
| Models     | `Webinar`, `Event`; Product has optional `webinarId` (or Webinar has `productId`) |
| Repos      | `webinar.repo`, `event.repo`; `product.repo` extended with `createProductOnly` (no variant); `productVariant.repo` / product.repo for creating variant+price for event |
| Services   | `webinar.service`, `event.service`; orchestrate auto-create Product on Webinar create, auto-create ProductVariant+Price on Event create |
| Controllers| Admin: `webinars.controller` (CRUD + events list/add); Web: `webinars.controller` (list, show with events) |
| Routes     | Admin: `/webinars`, `/webinars/new`, `/webinars/:id/edit`, `/webinars/:id/events/new`, etc.; Web: `/webinars`, `/webinars/:slug` |
| Views      | Admin: webinars index, webinars form, webinar edit (with events list), event form; Web: webinars list, webinar show (events = add-to-cart slots) |

### 1.3 Ecommerce Core Preservation

- **Cart** and **Order** continue to reference only **ProductVariant** (no `eventId` on CartLine/OrderLine).
- Adding an event slot to cart = adding that event’s **ProductVariant**.
- Existing cart, checkout, and order flows remain unchanged; event-based products are just products of type "webinar" (or "classroom") with one variant per event.

---

## 2. Data Model

### 2.1 Webinar

| Column       | Type           | Notes |
|-------------|----------------|-------|
| id          | UUID PK        | |
| title       | STRING NOT NULL| |
| slug        | STRING NOT NULL, UNIQUE | URL-friendly |
| description | TEXT NULL      | |
| priceAmount | DECIMAL(10,2)  | Default price for all events (e.g. 0) |
| currency    | STRING(3)      | Default "USD" |
| productId   | UUID NULL FK → products.id | Set when Product is auto-created |
| active      | BOOLEAN        | Default true |
| createdAt, updatedAt | | |

- One Webinar → one Product (1:1). Product is created on Webinar create and `webinar.productId` is set.

### 2.2 Event

| Column          | Type           | Notes |
|-----------------|----------------|-------|
| id              | UUID PK        | |
| webinarId       | UUID NOT NULL FK → webinars.id | |
| productVariantId | UUID NULL FK → product_variants.id | Set when Variant is auto-created |
| startDate       | DATE NOT NULL  | |
| startTime       | TIME NULL      | Optional |
| endDate         | DATE NULL      | Optional |
| endTime         | TIME NULL      | Optional |
| location        | STRING NULL    | Optional |
| capacity        | INTEGER NULL   | Optional (max attendees) |
| createdAt, updatedAt | | |

- One Event → one ProductVariant (1:1). Variant is created when Event is created and `event.productVariantId` is set.
- **Extensibility**: Later, add `classroomId` (nullable) and/or `seminarId` (nullable) with a rule "exactly one of webinarId, classroomId, seminarId set", or introduce an `offeringId` + `offeringType` polymorphic pattern.

### 2.3 Product (existing)

- No new required columns. Optional: `webinarId` (UUID NULL FK → webinars.id) for reverse lookup from Product to Webinar. Alternatively, Webinar holds `productId` and Product has no FK back (simpler; use Webinar to find Product).

### 2.4 ProductVariant (existing)

- No schema change. Event holds `productVariantId`; variant belongs to Product (webinar’s product).

### 2.5 Constants

- Add `src/constants/eventOfferings.js` if needed (e.g. OFFERING_TYPE_WEBINAR = 'webinar', product type slugs for webinar/classroom/seminar). Product types already exist (webinar, classroom) from seed.

---

## 3. Fixed Automation Rules

### 3.1 When Webinar is created

1. Resolve **ProductType** for webinar (e.g. `productTypeRepo.findBySlug('webinar')`). If not found, fail or create product without type (prefer: require webinar type to exist).
2. Ensure **product slug** is unique: use a prefix like `webinar-` + webinar.slug; if collision, append a short unique suffix (e.g. UUID slice).
3. **Create Product** with:
   - title = webinar.title
   - slug = `webinar-` + webinar.slug (or uniquified)
   - description = webinar.description
   - productTypeId = webinar product type id
   - productCategoryId = null
   - active = webinar.active
   - isPhysical = **false**
   - weight / weightUnit = null
4. **Do not create** ProductVariant or ProductPrice at this step (product has 0 variants until first Event).
5. Update **Webinar** with productId = created product id.

**Implementation**: Use a new repo method `productRepo.createProductOnly(data)` that only creates the Product row (no variant, no price, no meta objects). Then in webinar.service (or webinar.repo), after creating Webinar, call productRepo.createProductOnly(…) and set webinar.productId.

### 3.2 When Event is added to a Webinar

1. Load Webinar (with productId). If webinar.productId is null, fail (should not happen if Webinar was created through normal flow).
2. **Create ProductVariant** for productId = webinar.productId:
   - title = e.g. `"{Webinar.title} – {Event.startDate} {Event.startTime}"` (format configurable; ensure uniqueness per event)
   - isDefault = false (or true for the first event of the webinar, depending on product.repo expectations; existing code often assumes one default variant – for multi-variant products the "default" is often the first. Set isDefault = true for the first variant of this product, false otherwise.)
   - active = true
   - sku = optional, e.g. `webinar-{webinarId}-{eventId}` (or leave null)
3. **Create ProductPrice** for the new variant:
   - amount = webinar.priceAmount (or 0)
   - currency = webinar.currency
   - isDefault = true (for that variant)
4. Set **Event.productVariantId** = new variant id.
5. All in a **transaction** (Event create, Variant create, Price create, Event update).

**Implementation**: In event.service (or event.repo), create Event record first (with productVariantId null), then create ProductVariant and ProductPrice, then update Event.productVariantId. Or create variant+price first, then create Event with productVariantId set. Use sequelize.transaction.

### 3.3 When Webinar is updated

- Optionally **sync Product** fields (title, slug, description, active) from Webinar so the product stays in sync. If slug is edited, product slug may need to stay stable for existing links (or update product slug with same prefix rule). Plan: on Webinar update, update the linked Product’s title, description, active; slug can be updated with same uniquification rule if desired.

### 3.4 When Event is updated

- Optionally sync **ProductVariant.title** (e.g. event date/time) and **ProductPrice** if webinar price changed. For MVP, updating Event dates doesn’t require updating variant title (or we do update variant title when Event is updated).

### 3.5 When Event is deleted

- Decide: soft-delete Event and hide variant, or hard-delete Event and delete ProductVariant (and ProductPrice). If variant was already ordered, do not delete variant; only unlink Event (set event.productVariantId = null) or keep Event for history. **Production**: Prefer soft-delete or "cancelled" for Event; if no order lines reference the variant, can delete variant; otherwise keep variant and mark event as cancelled.

### 3.6 When Webinar is deleted

- If Webinar has Events with variants that have OrderLines, prevent delete or cascade carefully. Prefer: prevent delete if any variant of webinar’s product has order lines; otherwise delete Webinar, then Product (cascade deletes variants and prices). Implement in webinar.service.

---

## 4. Step-by-Step Implementation

### Phase A: Models, migrations, associations

**Step A1 – Migration: create webinars table**

- Create migration `YYYYMMDDHHMMSS-create-webinars-table.js`.
- Table `webinars`: id (UUID PK), title (STRING NOT NULL), slug (STRING NOT NULL UNIQUE), description (TEXT), priceAmount (DECIMAL(10,2)), currency (STRING(3)), productId (UUID NULL FK → products.id ON DELETE SET NULL or RESTRICT), active (BOOLEAN default true), createdAt, updatedAt.
- Index on slug; index on productId.

**Step A2 – Migration: create events table**

- Create migration `YYYYMMDDHHMMSS-create-events-table.js`.
- Table `events`: id (UUID PK), webinarId (UUID NOT NULL FK → webinars.id ON DELETE CASCADE), productVariantId (UUID NULL FK → product_variants.id ON DELETE SET NULL), startDate (DATE NOT NULL), startTime (TIME), endDate (DATE), endTime (TIME), location (STRING), capacity (INTEGER), createdAt, updatedAt.
- Index on webinarId; index on productVariantId (unique if 1:1).

**Step A3 – Models**

- Create `src/models/Webinar.js` (Sequelize define with tableName `webinars`, same columns as migration).
- Create `src/models/Event.js` (Sequelize define with tableName `events`).
- In `src/models/index.js`: define associations:
  - Webinar.belongsTo(Product, { foreignKey: 'productId' }); Product.hasOne(Webinar, { foreignKey: 'productId' });
  - Event.belongsTo(Webinar, { foreignKey: 'webinarId' }); Webinar.hasMany(Event, { foreignKey: 'webinarId' });
  - Event.belongsTo(ProductVariant, { foreignKey: 'productVariantId' }); ProductVariant.hasOne(Event, { foreignKey: 'productVariantId' });
- Export Webinar and Event from models/index.js.

---

### Phase B: Repos

**Step B1 – product.repo: createProductOnly**

- Add `createProductOnly(data, options)` to `src/repos/product.repo.js`.
- Accepts: title, slug, description, productTypeId, productCategoryId (optional), active, isPhysical (default false).
- Creates only **Product** (no ProductVariant, no ProductPrice, no meta objects). Uses transaction if passed in options.
- Returns created Product.

**Step B2 – webinar.repo**

- Create `src/repos/webinar.repo.js`: findAll, findById, findBySlug, create, update, delete. Include Product in findById/findBySlug when needed. Follow pattern of productType.repo.

**Step B3 – event.repo**

- Create `src/repos/event.repo.js`: create, findById, findByWebinar (findAll where webinarId), update, delete. Optionally findByIdWithVariant for cart/display.

---

### Phase C: Services

**Step C1 – webinar.service**

- Create `src/services/webinar.service.js`.
- **create(data)**: Validate title, slug. Create Webinar record (productId null). Resolve productType by slug `'webinar'`. Build product slug (e.g. `webinar-` + webinar.slug), ensure unique (productRepo.findBySlug; if exists, append suffix). Call productRepo.createProductOnly(…). Update Webinar with productId. Use transaction. Return Webinar (with Product included if needed).
- **update(id, data)**: Update Webinar; optionally sync Product (title, description, active). Slug change can update product slug with same prefix rule.
- **findAll**, **findById**, **findBySlug**: Delegate to webinar.repo; include Product and Events when needed for edit/show.
- **delete(id)**: Check that no variant of webinar’s product has order lines (orderLine.repo or order.repo). If any, throw or return error. Else delete Webinar (productId set null or delete Product cascade – decide per migration). Prefer: prevent delete if product has ordered variants; otherwise delete Webinar and optionally delete Product (cascade variants).

**Step C2 – event.service**

- Create `src/services/event.service.js`.
- **create(data)**: Validate webinarId, startDate (and optional startTime, endDate, endTime, location, capacity). Load Webinar (with Product). Create ProductVariant (productId = webinar.productId, title = formatted from webinar title + event date/time, isDefault = first variant for this product or false). Create ProductPrice (variant id, amount = webinar.priceAmount, currency = webinar.currency). Create Event (webinarId, productVariantId = variant.id, startDate, startTime, …). All in transaction. Return Event (with ProductVariant/ProductPrice if needed).
- **update(id, data)**: Update Event; optionally update ProductVariant.title if date/time changed.
- **findByWebinar(webinarId)**: Return events for webinar (order by startDate, startTime).
- **delete(id)**: If Event’s variant has no OrderLines, delete ProductPrice and ProductVariant then Event; else soft-delete or keep Event and variant. Implement per product.repo delete logic (order line check).

---

### Phase D: Admin – Webinars CRUD and Events

**Step D1 – Routes (admin)**

- In `src/routes/admin/index.js` add:
  - GET `/webinars` → webinarsController.index
  - GET `/webinars/new` → webinarsController.newForm
  - POST `/webinars/new` → webinarsController.create
  - GET `/webinars/:id/edit` → webinarsController.editForm
  - POST `/webinars/:id/edit` → webinarsController.update
  - POST `/webinars/:id/delete` → webinarsController.delete
  - GET `/webinars/:id/events/new` → webinarsController.newEventForm
  - POST `/webinars/:id/events/new` → webinarsController.createEvent
  - GET `/webinars/:webinarId/events/:id/edit` → webinarsController.editEventForm
  - POST `/webinars/:webinarId/events/:id/edit` → webinarsController.updateEvent
  - POST `/webinars/:webinarId/events/:id/delete` → webinarsController.deleteEvent

**Step D2 – Controller: webinars.controller (admin)**

- Create `src/controllers/admin/webinars.controller.js`.
- **index**: webinarService.findAll(); render admin/webinars/index with webinars list.
- **newForm**: Render admin/webinars/form with webinar = null, isEdit = false.
- **create**: Validate body (title, slug, priceAmount optional). webinarService.create(req.body). Flash success, redirect to /webinars/:id/edit. On error, re-render form with error.
- **editForm**: webinarService.findById(id) with Events. If !webinar, flash error, redirect to /webinars. Render admin/webinars/edit with webinar, events.
- **update**: Validate; webinarService.update(id, body). Flash success, redirect to edit. On error, re-render edit with error.
- **delete**: webinarService.delete(id). Flash success/error, redirect to /webinars.
- **newEventForm**: Load webinar; if !webinar redirect. Render admin/webinars/event-form with webinar, event = null.
- **createEvent**: eventService.create({ webinarId, startDate, startTime, endDate, endTime, location, capacity }). Redirect to webinar edit with success. On error, re-render event form.
- **editEventForm** / **updateEvent** / **deleteEvent**: Similar; load event, update or delete, redirect to webinar edit.

Use asyncHandler; use req.adminPrefix for redirects. Follow pattern of productTypes.controller and products.controller.

**Step D3 – Views (admin)**

- **admin/webinars/index.pug**: List webinars (title, slug, events count, link to edit). Button "Add Webinar" → /webinars/new.
- **admin/webinars/form.pug**: Form for create/edit Webinar (title, slug, description, priceAmount, currency, active). Post to new or edit. Cancel → /webinars.
- **admin/webinars/edit.pug**: Show webinar details; list Events (startDate, startTime, location, link to edit event, delete). Button "Add Event" → /webinars/:id/events/new.
- **admin/webinars/event-form.pug**: Form for create/edit Event (startDate, startTime, endDate, endTime, location, capacity). Post to events/new or events/:id/edit. Cancel → webinar edit.

**Step D4 – Admin sidebar**

- Add "Webinars" link to admin sidebar (migration adding menu item for url `/webinars`, or hardcode in dash-nav.pug). Prefer migration for consistency with existing Orders/Product Types.

---

### Phase E: Public – Webinars list and show

**Step E1 – Routes (web)**

- In web routes (e.g. `src/routes/web/index.js` or a new webinars.routes.js mounted under `/webinars`):
  - GET `/webinars` → webinarsController (web).list
  - GET `/webinars/:slug` → webinarsController.show (by webinar slug; show events as add-to-cart slots)

**Step E2 – Controller (web)**

- Create `src/controllers/web/webinars.controller.js` (or add to an existing controller).
- **list**: webinarService.findAllForPublic() (active webinars, with event count or next event). Render web/webinars/index.
- **show**: webinarService.findBySlugForPublic(slug) with Events (and each event’s productVariantId for add-to-cart). If !webinar, 404. Render web/webinars/show with webinar, events (each event includes variant id and price for cart link).

**Step E3 – Views (web)**

- **web/webinars/index.pug**: List webinars (title, excerpt, link to /webinars/:slug).
- **web/webinars/show.pug**: Webinar title, description; table/list of Events (startDate, startTime, location, price, "Add to cart" linking to cart add with productVariantId). Use existing cart add flow (e.g. POST /cart/add with productVariantId and quantity).

**Step E4 – Cart add**

- Existing cart flow: add by productVariantId. From webinar show page, "Add to cart" submits the event’s productVariantId. No change to cart.repo/cart.service; only ensure webinars/show passes variant ids to the add-to-cart form/link.

---

### Phase F: Product slug uniqueness and productType

**Step F1 – productType for webinar**

- Ensure product type with slug `webinar` exists (already seeded in 20260204140000). webinar.service should resolve it by slug and fail clearly if missing.

**Step F2 – Product slug prefix**

- In webinar.service create, use slug prefix `webinar-` + webinar.slug. Before createProductOnly, check productRepo.findBySlug(slug); if exists, append `-` + shortId (e.g. uuid.slice(0,8)) and retry or use that.

---

### Phase G: Delete and edge cases

**Step G1 – Webinar delete**

- In webinar.service.delete: load Webinar and Product; get all variant ids for that product; check OrderLine.count({ where: { productVariantId: variantIds } }). If > 0, return error "Cannot delete webinar: it has been ordered." Else delete Webinar (and optionally Product to cascade variants). Decide whether to keep Product for audit or delete; document in plan.

**Step G2 – Event delete**

- In event.service.delete: if Event has productVariantId, check OrderLine.count for that variant. If 0, delete ProductPrice (for that variant), ProductVariant, then Event. If > 0, do not delete variant; either prevent event delete or unlink Event from variant (set productVariantId null) and mark event cancelled in UI. Prefer: prevent event delete if variant has orders; else delete variant and event.

---

### Phase H: Different checkout flows – offering-specific buy URLs (e.g. /webinars/:slug/buy)

**Goal**: Use **different checkout flows** per offering type instead of a single generic checkout. For webinars: user goes to **/webinars/:slug/buy** (e.g. /webinars/infekcije/buy) to purchase; for classrooms/seminars later: /classrooms/:slug/buy, /seminars/:slug/buy. After payment, user is still routed to **/orders/:orderId** for order confirmation.

**Step H1 – URL pattern**

- **Webinars**: GET `/webinars/:slug/buy` → show buy/register page (list events, choose one, proceed to payment). POST `/webinars/:slug/buy` (body: eventId or productVariantId, quantity) → create order, create Stripe session, redirect to Stripe; success URL = `/orders/:orderId`.
- **Classrooms / Seminars** (later): same pattern at `/classrooms/:slug/buy`, `/seminars/:slug/buy`.
- This keeps a **distinct flow** from generic cart checkout (e.g. /checkout) so event-type offerings have their own entry point and UX.

**Step H2 – Flow**

1. User is on webinar show page (/webinars/:slug) or goes directly to /webinars/:slug/buy.
2. On buy page: select event (slot), optionally quantity; click "Register" or "Buy".
3. Backend creates Order with one OrderLine (that variant), creates Stripe Checkout Session (or PaymentIntent) for that order, redirects to Stripe (or shows payment form).
4. On payment success, user is redirected to **/orders/:orderId** (order confirmation).

**Step H3 – Routes (web)**

- GET `/webinars/:slug/buy` → show buy page (webinar + events, select event, form to submit).
- POST `/webinars/:slug/buy` → body: eventId (or productVariantId), quantity. Create order, create Stripe session, respond with redirect to Stripe (success_url = `/orders/:orderId`).

**Step H4 – Controller / service**

- **webinars.controller (web)**: buyForm(req, res) for GET – load webinar by slug with events; render webinars/buy. buy(req, res) for POST – validate eventId/productVariantId, call orderService.createOrderFromWebinarEvent(webinarId, eventId, userId, sessionId), then Stripe createCheckoutSession(orderId, …) with success_url = baseUrl + '/orders/' + orderId, redirect to Stripe URL.
- **order.service**: add createOrderFromWebinarEvent(webinarId, eventId, userId, sessionId) – creates Order (paymentStatus: pending) with one OrderLine, sets total, returns order. Same pattern later for classrooms/seminars (createOrderFromClassroomEvent, etc.).

**Step H5 – Views**

- **web/webinars/buy.pug**: Webinar title; list events (date, time, location, price); for each event, "Register" or select one and single "Buy" button. Form POSTs to /webinars/:slug/buy with chosen eventId. Or: one event per row with "Buy" that POSTs with that eventId.

**Step H6 – Order confirmation**

- GET `/orders/:id` (existing) shows the order; for event-type lines, resolve variant → Event to show startDate, startTime in the view.

**File checklist (Phase H)**

- order.service: add createOrderFromWebinarEvent (or createOrderSingleItem).
- Web routes: GET and POST /webinars/:slug/buy (and later /classrooms/:slug/buy, /seminars/:slug/buy).
- Web webinars controller: buyForm, buy (create order + Stripe session, redirect to Stripe; success_url = /orders/:orderId).
- Web view: webinars/buy.pug (event selection + form to POST buy).
- Stripe success redirect URL: `/orders/:orderId`.

---

### Phase I: Optional – Event-only cart checkout (generic cart path)

- If user adds multiple event slots (or event + other products) to cart and goes through **generic** checkout: detect cart with only event-type products and skip shipping step or show different confirmation. Redirect to `/orders/:orderId` after payment. Can be a separate small task after core is done.

---

### Phase J: Extensibility – Classroom / Seminar

- **Classroom**: Add Classroom model (same shape as Webinar: title, slug, description, productId, priceAmount, currency). Add Event.classroomId (nullable). Constraint: Event has exactly one of webinarId, classroomId (and later seminarId). Reuse same automation: create Product (productTypeId = classroom), create Event + Variant for Classroom. Admin section "Classrooms" with same UX as Webinars.
- **Seminar**: Same pattern. Optional: refactor to single **Offering** model (type = webinar | classroom | seminar) and Event.offeringId to reduce tables; or keep separate Webinar, Classroom, Seminar for clarity.

---

## 5. File Checklist

| Action | File |
|--------|------|
| Create | Migration: create webinars table |
| Create | Migration: create events table |
| Create | src/models/Webinar.js |
| Create | src/models/Event.js |
| Update | src/models/index.js (associations, exports) |
| Update | src/repos/product.repo.js (createProductOnly) |
| Create | src/repos/webinar.repo.js |
| Create | src/repos/event.repo.js |
| Create | src/services/webinar.service.js |
| Create | src/services/event.service.js |
| Create | src/controllers/admin/webinars.controller.js |
| Update | src/routes/admin/index.js (webinars routes) |
| Create | src/views/admin/webinars/index.pug |
| Create | src/views/admin/webinars/form.pug |
| Create | src/views/admin/webinars/edit.pug |
| Create | src/views/admin/webinars/event-form.pug |
| Add | Admin sidebar: Webinars link (migration or dash-nav.pug) |
| Create | src/controllers/web/webinars.controller.js (or add to existing) |
| Update | Web routes: GET /webinars, GET /webinars/:slug |
| Create | src/views/web/webinars/index.pug |
| Create | src/views/web/webinars/show.pug |
| Update | order.service (createOrderFromWebinarEvent or createOrderSingleItem) |
| Update | Web routes: GET/POST /webinars/:slug/buy (and later /classrooms/:slug/buy, etc.) |
| Update | Web webinars controller: buyForm, buy → order + payment, redirect to /orders/:id |
| Create | src/views/web/webinars/buy.pug |

---

## 6. Production Readiness

- **Transactions**: Use sequelize.transaction for Webinar create (Webinar + Product) and Event create (Event + ProductVariant + ProductPrice).
- **Validation**: Validate Webinar (title, slug required; slug format). Validate Event (webinarId, startDate required; startDate not in past if needed).
- **Authorization**: Admin routes behind requireAuth (existing middleware). Web routes public for list/show.
- **Errors**: Return clear messages (e.g. "Product type 'webinar' not found. Create it in Product Types.").
- **Idempotency**: Product slug uniquification avoids duplicate slug on create.
- **Delete guards**: Do not delete Webinar/Event if linked variant has order lines; return clear error. See Phase G.
- **Logging**: Log webinar and event create/update/delete in service layer for audit.

---

## 7. Summary

- **Webinar** and **Event** models give a clear abstraction for event-based offerings; **Product** and **ProductVariant** are created by fixed rules so admins work only with Webinar and Events.
- **createProductOnly** keeps event-based products from having a default variant until the first Event; each Event gets one Variant and one Price.
- **Cart/Order** remain variant-only; adding an event slot to cart is adding that event’s ProductVariant.
- **Classroom** and **Seminar** can be added later with the same pattern (new model + Event.classroomId/seminarId or unified Offering).
- **Calendar** integration can be added later by querying Events (startDate, startTime, endDate) for iCal or API.

Implement in the order of phases above; each step stays within Routes → Controllers → Services → Repos → Models and reuses existing patterns (asyncHandler, setFlash, adminPrefix, slugify, validation).
