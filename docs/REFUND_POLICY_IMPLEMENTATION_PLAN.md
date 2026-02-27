# Refund Policy & Refund Request Implementation Plan

This document is a **step-by-step implementation plan** for adding Policy creation (Refund Policies linked to ProductType), user refund requests (order-level and line-level), admin policy management, and Stripe refund processing. The plan follows the existing **Routes → Controllers → Services → Repos → Models** cycle and production-ready patterns used in the codebase.

---

## 1. Overview

### 1.1 Goals

- **Admin**: Create and manage Refund Policies at `/policies`; assign a Refund Policy to each Product Type on the Product Type edit page.
- **Admin**: Add "Policies" to the admin sidebar.
- **User**: Request refund at **order level** (from "My Orders" list) or at **order line level** (from single order detail page when clicking "Edit" / "Request refund" on the order).
- **Admin**: Process refund requests; Stripe refunds go to the **original payment method** (PaymentIntent used for the order).
- **Policies**: Support different window types (fulfillment-based, event/start-date-based, purchase-based, not returnable) so they can be applied to different product types (e.g. chicken eggs vs webinars vs classrooms).

### 1.2 Architecture Summary

| Layer   | New/Updated |
|---------|-------------|
| Models  | `RefundPolicy`, `Refund`, `RefundLine`; `ProductType.refundPolicyId` |
| Repos   | `refundPolicy.repo`, `refund.repo`, `refundLine.repo`; `productType.repo` (no schema change in repo, just usage); `order.repo` (getLines with ProductType + RefundPolicy for refund flow) |
| Services| `refundPolicy.service`, `refund.service`; `productType.service` (update to accept refundPolicyId); `order.service` (refund eligibility, create refund request, process refund) |
| Controllers | Admin: `policies.controller`, `productTypes.controller` (add refund policy dropdown), `orders.controller` (refund actions); Web: `orders.controller` (request refund) |
| Routes  | Admin: `/policies`, `/policies/new`, `/policies/:id/edit`, product-types edit (existing), orders edit + refund; Web: `/orders`, `/orders/:id` + request refund |
| Views   | Admin: policies index/form, product-types form (dropdown), orders edit (refund UI); Web: orders list + order detail (refund request) |
| Gateway| Stripe: use existing `createRefund(paymentIntentId, amount)` for processing refunds |

---

## 2. Data Model

### 2.1 RefundPolicy

Stores one policy template. Used by ProductType (and optionally later by Product override or Store default).

| Column | Type | Notes |
|--------|------|--------|
| id | UUID PK | |
| name | STRING NOT NULL | e.g. "30 days after delivery" |
| slug | STRING NOT NULL UNIQUE | e.g. "30-days-after-delivery" |
| windowType | ENUM | `delivery_based`, `event_based`, `purchase_based`, `not_returnable` |
| daysValue | INTEGER | e.g. 7, 30 (nullable if windowType = not_returnable) |
| daysUnit | ENUM | `before`, `after` (nullable if not_returnable) |
| restockingFeePercent | DECIMAL(5,2) | optional, 0–100 |
| returnShippingCost | ENUM | `free`, `flat`, `customer_pays` (optional) |
| description | TEXT | optional human-readable summary |
| createdAt, updatedAt | | |

- **delivery_based**: refund within `daysValue` days **after** delivery (use order/line fulfillment or delivery date).
- **event_based**: refund until `daysValue` days **before** event start (requires event start date; can come from product meta or a future Event model).
- **purchase_based**: refund within `daysValue` days **after** purchase (order createdAt).
- **not_returnable**: no refunds; `daysValue`/`daysUnit` null.

### 2.2 ProductType (change)

Add:

| Column | Type | Notes |
|--------|------|--------|
| refundPolicyId | UUID NULL FK → refund_policies.id | Optional; null = no default policy |

### 2.3 Refund

One record per refund operation (full or partial).

| Column | Type | Notes |
|--------|------|--------|
| id | UUID PK | |
| orderId | UUID FK NOT NULL | |
| amountTotal | DECIMAL(10,2) NOT NULL | Sum of RefundLines (or full order if full refund) |
| currency | STRING NOT NULL | |
| status | ENUM | `pending`, `processing`, `completed`, `failed`, `cancelled` |
| stripeRefundId | STRING NULL | Set when Stripe refund created |
| reason | STRING NULL | Optional (e.g. "Customer request") |
| requestedByUserId | UUID NULL FK | User who requested (null if guest) |
| processedAt | DATE NULL | When Stripe refund succeeded |
| createdAt, updatedAt | | |

### 2.4 RefundLine

Per-line breakdown of a refund.

| Column | Type | Notes |
|--------|------|--------|
| id | UUID PK | |
| refundId | UUID FK NOT NULL | |
| orderLineId | UUID FK NOT NULL | |
| quantityRefunded | INTEGER NOT NULL | |
| amountRefunded | DECIMAL(10,2) NOT NULL | |
| createdAt, updatedAt | | |

### 2.5 Order (optional later)

- Optionally add `refundedAmount` DECIMAL to track total refunded per order (for partial refunds and display). Can be derived from Refund/RefundLine for MVP.

### 2.6 Constants

- **refundPolicy.js**: `REFUND_POLICY_WINDOW_TYPES`, `REFUND_POLICY_DAYS_UNITS`, `REFUND_STATUSES`, etc.
- **order.js**: Already has `PAYMENT_STATUSES` including `refunded`; keep as-is.

---

## 3. Step-by-Step Implementation

### Phase A: Models, migrations, associations

**Step A1 – Constants**

- Add `src/constants/refundPolicy.js`: window types, days units, return shipping cost options.
- Add `src/constants/refund.js`: refund statuses (pending, processing, completed, failed, cancelled).
- Export from `src/constants/index.js` if present.

**Step A2 – RefundPolicy model**

- Create `src/models/RefundPolicy.js` with fields above.
- Create migration: `create-refund-policies-table` (table `refund_policies`).

**Step A3 – ProductType.refundPolicyId**

- Add `refundPolicyId` to `src/models/ProductType.js`.
- Create migration: `add-refund-policy-id-to-product-types` (FK to `refund_policies.id`, nullable).

**Step A4 – Refund and RefundLine models**

- Create `src/models/Refund.js` and `src/models/RefundLine.js`.
- Create migration: `create-refunds-and-refund-lines-tables` (tables `refunds`, `refund_lines`; FKs: orderId, requestedByUserId; orderLineId).

**Step A5 – Associations**

- In `src/models/index.js`: RefundPolicy hasMany ProductType; ProductType belongsTo RefundPolicy. Order hasMany Refund; Refund belongsTo Order. Refund hasMany RefundLine; RefundLine belongsTo Refund, OrderLine. User hasMany Refund (requestedBy); Refund belongsTo User (optional). OrderLine hasMany RefundLine; RefundLine belongsTo OrderLine.

---

### Phase B: Repos

**Step B1 – refundPolicy.repo**

- Create `src/repos/refundPolicy.repo.js`: `findAll`, `findById`, `findBySlug`, `create`, `update`, `delete`, `count`. Same pattern as `productType.repo`.

**Step B2 – refund.repo**

- Create `src/repos/refund.repo.js`: `create`, `findById`, `findByOrder`, `update` (for status, stripeRefundId, processedAt). Optionally `findPendingByOrder`.

**Step B3 – refundLine.repo**

- Create `src/repos/refundLine.repo.js`: `create`, `findByRefund`, `bulkCreate` for a refund.

**Step B4 – order.repo (refund flow)**

- Add a method e.g. `getLinesWithPolicy(orderId, options)` that loads OrderLines with ProductVariant → Product → ProductType → RefundPolicy, so eligibility can be computed per line. Reuse or extend existing `getLines` include.

---

### Phase C: Services

**Step C1 – refundPolicy.service**

- Create `src/services/refundPolicy.service.js`: `findAll`, `findById`, `findBySlug`, `create`, `update`, `delete`. Validation: name/slug required; windowType in enum; if not_returnable, daysValue/daysUnit optional; otherwise daysValue required. Slugify from name if slug empty.

**Step C2 – refund.service**

- Create `src/services/refund.service.js`:
  - **computeEligibility(orderId)**  
    Load order + lines with ProductType + RefundPolicy. For each line, resolve effective RefundPolicy (ProductType.refundPolicyId). Compute eligible window (delivery_based: from fulfillment/delivery date; event_based: from product/event start date if available; purchase_based: from order createdAt). Return structure like `{ orderId, lines: [{ orderLineId, productTitle, quantity, price, policy, eligible, refundableAmount, reasonNotEligible? }], orderTotalRefundable }`.
  - **requestRefund(orderId, payload, userId)**  
    Payload: `{ fullOrder: true }` or `{ orderLineIds: [...], quantities?: { [orderLineId]: qty } }`. Validate ownership (order.userId / order.sessionId vs current user/session). Compute eligibility; if full order, use all eligible lines; otherwise only specified lines. Create Refund (status: pending) and RefundLines; return Refund with lines.
  - **processRefund(refundId)**  
    Admin-only. Load Refund and RefundLines; sum amount; get Order.stripePaymentIntentId; call Stripe gateway `createRefund(paymentIntentId, amount)`. On success: update Refund (status: completed, stripeRefundId, processedAt); update Transaction if needed; if refund amount >= order total, set Order.paymentStatus to `refunded`. On failure: set Refund.status to failed. Use transaction for DB updates.

**Step C3 – productType.service**

- In `create` and `update`, accept `refundPolicyId` (optional UUID or empty string → null). Validate that refundPolicyId exists in RefundPolicy if provided.

**Step C4 – order.service**

- Add `getOrderWithLinesForRefund(orderId, userId, sessionId)`: same as getOrderWithLines but with getLinesWithPolicy so user/controller can show per-line eligibility and request refund.

---

### Phase D: Stripe refund flow

**Step D1 – Gateway**

- Existing `stripe.gateway.js` already has `createRefund(paymentIntentId, amount)` (amount in major units, converted to cents). Ensure it returns the Stripe Refund object (e.g. `refund.id`) so refund.service can store `stripeRefundId`.

**Step D2 – Webhook**

- Existing `charge.refunded` handler updates Transaction status. Ensure it does not conflict with Refund record updates; Refund is the source of truth for “we initiated a refund”; webhook can remain for reconciliation. Optionally in webhook, find Refund by order and update status if not already completed (idempotent).

---

### Phase E: Admin – Policies CRUD

**Step E1 – Routes**

- In `src/routes/admin/index.js`:  
  - `GET /policies` → policiesController.index  
  - `GET /policies/new` → policiesController.newForm  
  - `POST /policies/new` → policiesController.create  
  - `GET /policies/:id/edit` → policiesController.editForm  
  - `POST /policies/:id/edit` → policiesController.update  
  - `POST /policies/:id/delete` → policiesController.delete  

**Step E2 – Controller**

- Create `src/controllers/admin/policies.controller.js`: index (list all RefundPolicies), newForm (empty form), create (validate, slugify, refundPolicyService.create), editForm (load by id), update (validate, refundPolicyService.update), delete (refundPolicyService.delete). Use asyncHandler. Set flash and redirect; on validation error re-render form with error. Follow pattern of productTypes.controller.

**Step E3 – Views**

- Create `src/views/admin/policies/index.pug`: list policies with Edit / Delete; "Add Policy" button to `/policies/new`.
- Create `src/views/admin/policies/form.pug`: fields name, slug, windowType (select), daysValue, daysUnit (select), restockingFeePercent, returnShippingCost (select), description. Submit to new or edit. Cancel link to `/policies`.

**Step E4 – Sidebar**

- Add "Policies" to admin sidebar: either add a new migration that inserts a menu item into `menu_items` for `admin-sidebar` with url `/policies` and label "Policies", or add a hardcoded link in `src/views/fragments/admin/dash-nav.pug` (e.g. after "Product Types": `a(class="dash-link" href=(adminPrefix || '') + "/policies") Policies`). Prefer migration for consistency with Orders/Product Types.

---

### Phase F: Admin – Product Type ↔ Refund Policy

**Step F1 – Product type edit form**

- In `src/controllers/admin/productTypes.controller.js`:  
  - editForm: load all RefundPolicies via refundPolicyService.findAll(); pass to view as `refundPolicies`.  
  - update: accept `refundPolicyId` from body (empty string → null); pass to productTypeService.update(id, { ..., refundPolicyId }).

**Step F2 – View**

- In `src/views/admin/product-types/form.pug`: add a dropdown "Refund policy" with option value="" "None", and for each refundPolicies item option value=policy.id and label=policy.name (and optionally slug). Pre-select productType.refundPolicyId when isEdit.

---

### Phase G: User – Request refund (order level and line level)

**Step G1 – Web routes**

- `GET /orders` – already lists orders (ordersController.list).  
- `GET /orders/:id` – already shows order (ordersController.show).  
- Add: `GET /orders/:id/request-refund` → show refund request page (eligibility + form).  
- Add: `POST /orders/:id/request-refund` → submit refund request (full order or selected lines).  
- Optionally: from list, add a "Request refund" link per order that goes to `/orders/:id/request-refund` or to `/orders/:id` with a section for refund (same page). Plan below uses a dedicated request-refund page for clarity.

**Step G2 – Web orders controller**

- **requestRefundForm(req, res)**: get orderId from params; getOrderWithLinesForRefund(orderId, userId, sessionId); call refundService.computeEligibility(orderId); render `web/order-request-refund` with order, lines, eligibility (per-line and total). Only for orders with paymentStatus === 'paid'; otherwise redirect to order with flash.
- **submitRefundRequest(req, res)**: parse body: fullOrder or orderLineIds (+ optional quantities). Call refundService.requestRefund(orderId, payload, userId). Redirect to `/orders/:id` with success flash; on error redirect back with error flash.

**Step G3 – Web order detail (order line level)**

- In `src/controllers/web/orders.controller.js` show(): when rendering order detail, optionally pass eligibility for each line (refundService.computeEligibility) so the view can show "Request refund" per line or "Request refund for this order". Alternatively, "Request refund" button on order detail links to `/orders/:id/request-refund` where user chooses full or partial.
- In `src/views/web/order.pug`: add "Request refund" button (only if paymentStatus === 'paid' and order not fully refunded), linking to `/orders/:id/request-refund`. On the request-refund page, show table of lines with eligibility and checkboxes for partial refund, plus "Refund entire order" option.

**Step G4 – Request refund view**

- Create `src/views/web/order-request-refund.pug`: title "Request refund"; order summary; table of line items with columns: Product, Qty, Price, Policy, Eligible?, Refundable amount; checkbox per line (or "Refund entire order" radio/checkbox). Submit to `POST /orders/:id/request-refund`. Show total refundable and any ineligible lines with reason.

**Step G5 – Web orders list**

- In `src/views/web/orders.pug`: add "Request refund" link next to each order (only if paymentStatus === 'paid'), linking to `/orders/:id/request-refund`.

---

### Phase H: Admin – Process refunds & Stripe

**Step H1 – Order edit: list refunds and "Process refund"**

- In admin orders editForm: load order via getOrderByIdForAdmin(id); then load lines via orderRepo.getLines(order.id) and refunds via refundRepo.findByOrder(order.id). Pass order, lines, refunds, validFulfillmentStatuses to the view. Show table of refunds (id, amount, status, requestedAt, processedAt). For each Refund with status `pending`, show button "Process refund" (or "Refund via Stripe").
- New route: `POST /orders/:id/refunds/:refundId/process` → ordersController.processRefund (admin). Controller: call refundService.processRefund(refundId). On success flash and redirect to order edit; on failure flash error and redirect back.

**Step H2 – refund.service.processRefund (detail)**

- Load Refund and RefundLines; sum amountTotal (already on Refund, but verify from lines). Load Order; ensure order.paymentStatus === 'paid' and order.stripePaymentIntentId present. Call gateway.createRefund(order.stripePaymentIntentId, amountTotal). Gateway returns Stripe refund object; save refund.stripeRefundId and set status = completed, processedAt = now. If amountTotal >= order.total, set order.paymentStatus = 'refunded'. Update Transaction(s) for that order if your design ties Refund to Transaction (e.g. mark transaction as refunded/partially_refunded). Use DB transaction.

**Step H3 – Admin order edit view**

- In `src/views/admin/orders/edit.pug`: add section "Refunds" with table (Refund id, amount, status, requested at, processed at); for status pending, form POST to `/orders/:orderId/refunds/:refundId/process` with button "Process refund". Show order lines so admin can see what was requested.

---

### Phase I: Policy types (fulfillment, start date, etc.)

**Step I1 – Eligibility rules**

- **delivery_based**: Use order.fulfillmentStatus and/or a delivery date. If you don’t have a per-line delivery date, use order.updatedAt when fulfillmentStatus became 'delivered' or a single `deliveredAt` on Order (add migration if needed). For simplicity, MVP can use order.updatedAt when status is 'delivered', or add `deliveredAt` DATE to orders.
- **event_based**: Need event start date per product/line. Options: (a) Product meta (e.g. ProductMetaObject or a JSON field `eventStartDate` on Product); (b) OrderLine metadata at placement (e.g. `eventStartDate` on order_line); (c) Separate Event table later. For MVP, add optional `eventStartDate` (DATE) to OrderLine (or to Product) and use it in computeEligibility: "refundable until (eventStartDate - daysValue)".
- **purchase_based**: Use order.createdAt + daysValue days.
- **not_returnable**: eligible = false; refundableAmount = 0.

**Step I2 – Admin policy form**

- Form already has windowType, daysValue, daysUnit. Add short help text: "Delivery-based: X days after delivery; Event-based: X days before event start; Purchase-based: X days after purchase; Not returnable: no refunds."

**Step I3 – ProductType assignment**

- Admin assigns one RefundPolicy per ProductType on product type edit; products of that type inherit the policy for eligibility. No policy = treat as not_returnable or use a future "store default" policy.

---

## 4. How the admin creates refund policies

1. **Go to Policies**  
   Admin opens sidebar → "Policies" → `/policies`. Sees list of existing policies.

2. **Create new policy**  
   Clicks "Add Policy" → `/policies/new`. Fills:
   - **Name**: e.g. "30 days after delivery"
   - **Slug**: e.g. "30-days-after-delivery" (or leave blank to auto-generate from name)
   - **Window type**: Delivery-based / Event-based / Purchase-based / Not returnable
   - **Days value**: e.g. 30 (ignored if "Not returnable")
   - **Days unit**: Before / After (e.g. "After" for delivery, "Before" for events)
   - **Restocking fee %**: optional
   - **Return shipping**: Free / Flat / Customer pays
   - **Description**: optional  
   Submits → policy is created and appears in list.

3. **Assign to Product Type**  
   Admin goes to "Product Types" → edits e.g. "Webinar". On edit form, selects "Refund policy" from dropdown (list of all RefundPolicies). Saves. From then on, all products of type Webinar use that policy for refund eligibility (e.g. "7 days before event start").

4. **User requests refund**  
   User goes to "My Orders" → clicks order → "Request refund" (or from list). Chooses full order or specific lines. Submits → Refund and RefundLines created with status `pending`.

5. **Admin processes refund**  
   Admin goes to Orders → Edit that order. Sees "Refunds" section with pending request(s). Clicks "Process refund" → backend calls Stripe with order’s PaymentIntent and refund amount → money returned to original payment method; Refund status set to completed; order payment status updated to refunded if full.

---

## 5. File Checklist

| Action | File |
|--------|------|
| Create | `src/constants/refundPolicy.js` |
| Create | `src/constants/refund.js` |
| Create | `src/models/RefundPolicy.js` |
| Create | `src/models/Refund.js` |
| Create | `src/models/RefundLine.js` |
| Update | `src/models/ProductType.js` (refundPolicyId) |
| Update | `src/models/index.js` (associations + exports) |
| Create | Migration: create refund_policies |
| Create | Migration: add refundPolicyId to product_types |
| Create | Migration: create refunds + refund_lines |
| Create | `src/repos/refundPolicy.repo.js` |
| Create | `src/repos/refund.repo.js` |
| Create | `src/repos/refundLine.repo.js` |
| Update | `src/repos/order.repo.js` (getLinesWithPolicy or extend getLines) |
| Create | `src/services/refundPolicy.service.js` |
| Create | `src/services/refund.service.js` |
| Update | `src/services/productType.service.js` (refundPolicyId) |
| Update | `src/services/order.service.js` (getOrderWithLinesForRefund) |
| Create | `src/controllers/admin/policies.controller.js` |
| Update | `src/controllers/admin/productTypes.controller.js` (refund policy dropdown) |
| Update | `src/controllers/admin/orders.controller.js` (refunds section, processRefund) |
| Update | `src/controllers/web/orders.controller.js` (requestRefundForm, submitRefundRequest) |
| Update | `src/routes/admin/index.js` (policies routes, refund process route) |
| Update | `src/routes/web/orders.routes.js` (request-refund GET/POST) |
| Create | `src/views/admin/policies/index.pug` |
| Create | `src/views/admin/policies/form.pug` |
| Update | `src/views/admin/product-types/form.pug` (refund policy dropdown) |
| Update | `src/views/admin/orders/edit.pug` (Refunds section, Process refund) |
| Create | `src/views/web/order-request-refund.pug` |
| Update | `src/views/web/order.pug` (Request refund button) |
| Update | `src/views/web/orders.pug` (Request refund link per order) |
| Update | Sidebar: migration or `dash-nav.pug` (Policies link) |
| Verify | `src/gateways/stripe.gateway.js` createRefund returns Stripe refund id |

---

## 6. Production readiness

- **Validation**: All policy and refund inputs validated in services; return clear errors to controllers.
- **Authorization**: Admin routes behind requireAuth; user refund requests check order ownership (userId/sessionId).
- **Idempotency**: Process refund: check Refund.status !== completed before calling Stripe; store stripeRefundId so duplicate clicks don’t double-refund.
- **Stripe**: Use existing createRefund; amount in major units; handle Stripe errors and set Refund.status to failed with optional error message in reason or a separate column.
- **Transactions**: Use sequelize.transaction() in processRefund and requestRefund where multiple rows are updated.
- **Logging**: Log refund requests and processing (success/failure) in refund.service / gateway.
- **CSRF**: All POST forms use CSRF token (follow existing app pattern).
- **Flash**: Success/error messages via res.setFlash / flash middleware on redirects.

---

## 7. Optional follow-ups

- **Store default policy**: When Store model exists, add default RefundPolicy to Store; resolution order Product → ProductType → Store.
- **Order line policy snapshot**: At order placement, copy effective refund policy id (or key fields) onto OrderLine for immutable history.
- **Event start date**: Add eventStartDate to Product or OrderLine and use in event_based eligibility.
- **Delivery date**: Add deliveredAt to Order (or use fulfillment history) for accurate delivery_based windows.
- **Refund reasons**: Dropdown or free text on request form and store on Refund.
- **Email**: Notify user when refund is requested and when processed (using existing or new email flow).

This plan keeps the flow strictly along Routes → Controllers → Services → Repos → Models and reuses the existing Stripe gateway and order/transaction patterns.
