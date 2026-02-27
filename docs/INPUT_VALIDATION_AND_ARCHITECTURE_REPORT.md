# Input Validation & Architecture Report

**Date:** February 11, 2025  
**Scope:** Input validation handling, Routes → Controllers → Services → Repos → Models flow, code quality, and production readiness.

---

## 1. Executive Summary

The application follows a clear **Routes → Controllers → Services → Repos → Models** layering. Input validation is applied **in controllers** using a mix of **shared Zod schemas** (in `src/validators/`) and **inline validation** in admin controllers. Coverage is good for user-facing and API payloads; a few gaps and one schema bug were found and are documented below. The codebase is structured for production with rate limiting, error handling, and gateway abstraction; addressing the noted validation gaps and standardizing error responses would improve production readiness further.

---

## 2. Architecture: Routes → Controllers → Services → Repos → Models

### 2.1 Flow Compliance

The codebase **consistently** follows the intended cycle:

| Layer    | Role |
|----------|------|
| **Routes** | Mount handlers, apply middleware (auth, rate limit, `asyncHandler`). No business or validation logic. |
| **Controllers** | Parse request (body, params, query), **validate input**, call services, format response (JSON or render). |
| **Services** | Business logic, orchestration, validation of business rules (e.g. fulfillment status whitelist). |
| **Repos** | Data access only; use Sequelize models. |
| **Models** | Sequelize definitions; some use `validate` for DB-level constraints. |

**Evidence (example – Cart API):**

- **Route** (`src/routes/api/cart.routes.js`): `router.post("/add", asyncHandler(cartApiController.add));`
- **Controller** (`src/controllers/api/cart.controller.js`): Calls `validateAddToCart(req.body)`, then `cartService.addToCart(...)`.
- **Service** (`src/services/cart.service.js`): Uses `cartRepo`, `productVariantRepo`; validates variant exists and has price.
- **Repo** (`src/repos/cart.repo.js`): Uses `Cart`, `CartLine`, `ProductVariant`, etc. from `../models`.

Admin flows (users, products, orders, collections, meta objects, menus, webinars, etc.) follow the same pattern: routes → admin controllers → services → repos → models.

### 2.2 Where Validation Lives

- Validation is **not** in routes as middleware; it is **inside controllers**.
- Shared validators live in **`src/validators/`** (Zod). Admin CRUD often uses **inline** validation (e.g. `validateProduct`, `validateUserInput`) in the controller file instead of shared schemas.

---

## 3. Input Validation Assessment

### 3.1 Validators in Use

| Validator / Area | Used By | Schema Location | Notes |
|------------------|--------|------------------|--------|
| Auth (login, register) | `auth.controller.js` | `validators/auth.schema.js` | Zod; returns first error message only. |
| Cart (add, update, remove) | API + web cart controllers | `validators/cart.schema.js` | Zod; UUID + quantity bounds. |
| Checkout | `checkout.controller.js` | `validators/checkout.schema.js` | Zod; all fields optional/nullable. |
| Contact | `api/contact.controller.js` | `validators/contact.schema.js` | Zod; **fixed** `z.email()` → `z.string().email()`. |
| Address | `addresses.controller.js` | `validators/address.schema.js` | Zod; required fields, `refine` for billing when not same as delivery. |
| Profile | `account.controller.js` | `validators/profile.schema.js` | Zod; forename, surname, mobile. |
| Meta objects | `admin/metaObjects.controller.js`, products | `validators/metaObject.schema.js` | Zod; name, slug, definition, type-safe values. |

### 3.2 Admin Controllers (Inline Validation)

Admin modules validate in the controller with ad-hoc functions (no shared Zod schema):

- **Users:** `validateUserInput({ email, username, password })` – email/username length, password length.
- **Products:** `validateProduct()` (title, slug, price) + `validateMetaObjectValues()` from shared validator.
- **Collections, Menus, Menu items, Product types, Posts, Webinars:** Local `validate*()` for title/slug/name/label/url/order.

These are consistent in spirit but **inconsistent in shape**: some return a single string error, others could be unified with Zod for clearer rules and error messages.

### 3.3 Validation Gaps and Fixes

| Area | Issue | Severity | Recommendation |
|------|--------|----------|-----------------|
| **Contact schema** | `z.email()` is not a valid Zod API (Zod uses `z.string().email()`). | **High** – would throw at runtime on contact submit. | **Fixed** in `contact.schema.js`: use `z.string().email("Invalid email").max(120)`. |
| **Payment method (add)** | `paymentMethodId` is only checked for presence; no format validation (e.g. Stripe `pm_*`). | Low | Optional: add Zod/string pattern or length to reject obviously invalid IDs. |
| **URL params (`:id`, `:slug`)** | IDs/slugs from `req.params` are not validated as UUID or safe string before use. | Low | Services/repos often treat missing entity as 404. Optional: validate UUID where IDs are UUIDs (e.g. cart, address). |
| **Order admin update** | `fulfillmentStatus` is passed from controller after trim; not whitelisted in controller. | None | Service layer `updateOrderForAdmin` already whitelists against `FULFILLMENT_STATUSES` and returns 400 for invalid value. |
| **Stripe webhook** | Body is not validated with a Zod schema. | By design | Signature verification via `constructWebhookEvent` is the correct security control; payload shape is trusted after verification. |

### 3.4 Consistency of Validation Response Shape

- **Auth:** Returns a single error **string** (`validateLogin` / `validateRegister` return `null` or message).
- **Cart, checkout, address, profile, contact, meta:** Return `{ ok: true, data }` or `{ ok: false, errors }` (Zod issues or array of strings).
- **Admin inline:** Usually a single error string for re-render.

So the app uses two patterns: **single message** (auth, admin) vs **structured errors** (API and some web forms). For production, consider standardizing API validation responses (e.g. always `{ error?: string, errors?: array }`) so clients can always expect the same shape.

---

## 4. Code Quality

### 4.1 Strengths

- **Layering:** Clear separation of routes, controllers, services, repos, and models; no business logic in routes or repos beyond data access.
- **Async handling:** `asyncHandler` wraps route handlers and forwards rejections to `next`, so unhandled promise rejections become 500s and are handled by the error middleware.
- **Constants:** Order statuses and similar values live in `src/constants/` and are used in services and repos, reducing magic strings.
- **Error middleware:** `error.middleware.js` differentiates API (JSON) vs web (render), hides 5xx details in non-development, and logs errors.
- **Rate limiting:** Auth and contact routes use `authLimiter` / `contactLimiter`, reducing brute-force and spam risk.
- **Stripe:** Webhook uses raw body and signature verification; payment config validated at startup.

### 4.2 Minor Improvements

- **Validator return shape:** Unify auth validators to return `{ ok, data }` / `{ ok: false, errors }` for consistency with the rest of the API, or document the two conventions.
- **Admin validators:** Optionally move admin CRUD validation into `src/validators/` with Zod (e.g. `user.schema.js`, `product.schema.js`) for reuse and clearer rules.
- **API validation error payload:** Some controllers return `{ error: "Invalid request." }` without forwarding Zod `errors`; returning the first or all validation messages would improve API usability.

---

## 5. Production Readiness

| Aspect | Status | Notes |
|--------|--------|--------|
| **Input validation** | Good | Most user/API inputs validated; contact schema bug fixed. Optional: paymentMethodId format, UUID params. |
| **Architecture** | Good | Routes → Controllers → Services → Repos → Models followed. |
| **Error handling** | Good | Central error handler, safe messages in production, requestId in API. |
| **Security** | Good | Rate limits (auth, contact), Stripe webhook verification, CSRF middleware present. |
| **Logging** | Present | Logger used for errors and some operations. |
| **Validation response shape** | Mixed | Standardizing API validation errors would improve production polish. |

**Verdict:** The application is **production-capable**. Addressing the contact schema fix (done) and optionally tightening validation and response consistency would further improve quality and operability.

---

## 6. Recommendations Summary

1. **Done:** Fix contact schema: use `z.string().email(...).max(120)` instead of `z.email()`.
2. **Optional:** Validate `paymentMethodId` format (e.g. Stripe prefix/length) in `paymentMethods.controller.js`.
3. **Optional:** Validate UUID for `:id` params where the resource is UUID-based (e.g. address, cart-related).
4. **Optional:** Standardize API validation responses (e.g. always include `errors` or a single `error` in a consistent shape).
5. **Optional:** Move admin CRUD validation into shared Zod schemas in `src/validators/` for consistency and maintainability.

---

*Report generated from codebase review. Fix for `contact.schema.js` applied in this session.*
