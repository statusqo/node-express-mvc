# Production Readiness Action Plan

This document provides a step-by-step plan to make the application production-ready based on the audit findings. Follow phases in order where dependencies exist.

**Context:** You're still developing; we keep dev ergonomics (e.g. session secret) simple while ensuring production safety.

---

## Phase 1: Configuration & Security (Deploy Blockers)

### Step 1.1 — Session Secret & Cookie Domain

**Goal:** Safe defaults for dev; strict checks for production.

1. **Update `src/config/index.js`:**
   - Keep `sessionSecret: getEnv("SESSION_SECRET", "change_me_in_production")` for dev.
   - Add a startup check (in `server.js` or app bootstrap): if `NODE_ENV === "production"` and `SESSION_SECRET` is unset, log an error and exit with code 1.
   - Add `cookieDomain: getEnv("COOKIE_DOMAIN", "")` — empty string means "omit domain" (browser default).
   - Remove hardcoded `"yourdomain.com"`.

2. **Update `src/app.js` (session cookie):**
   - Replace `domain: config.env === "production" ? "yourdomain.com" : undefined` with `domain: config.auth.cookieDomain || undefined`.
   - When `COOKIE_DOMAIN` is empty, `domain` stays `undefined` — works for single-domain and localhost.

3. **Update `.env.example`:**
   - Add `SESSION_SECRET=` and `COOKIE_DOMAIN=` with brief comments (e.g. for production, set both).

**Result:** Dev works unchanged; production fails fast if secrets are wrong.

---

### Step 1.2 — Stripe Webhook Error Exposure

**Goal:** Don't leak internal error details to webhook callers.

1. **Update `src/controllers/web/stripe.controller.js`:**
   - In the `catch` for signature verification (around line 17–20): replace  
     `return res.status(...).send(\`Webhook Error: ${err.message}\`)`  
     with  
     `return res.status(status >= 500 ? 500 : 400).send("Webhook Error")`.
   - Keep logging `err.message` server-side for debugging.

**Result:** External callers see only a generic message; logs keep full details.

---

## Phase 2: Constants & Single Source of Truth

### Step 2.1 — Create Constants Module

**Goal:** One place for shared constants.

1. **Create `src/config/constants.js`:**

   ```javascript
   /** Application-wide constants. */
   module.exports = {
     DEFAULT_CURRENCY: "USD",
     SALT_ROUNDS: 10,
   };
   ```

2. **Use it where duplicated:**
   - `src/services/order.service.js` — replace `DEFAULT_CURRENCY = "USD"` with import.
   - `src/services/account.service.js` — replace `SALT_ROUNDS = 10` with import.
   - `src/controllers/admin/users.controller.js` — replace `SALT_ROUNDS = 10` with import.
   - `src/db/seeders/20260124162520-demo-user.js` — import `SALT_ROUNDS` (optional; seeders can stay as-is if preferred).

**Result:** Single source for currency and SALT_ROUNDS.

---

### Step 2.2 — Transaction Model: ENUM + Exports

**Goal:** Model is the source of truth for transaction status.

1. **Update `src/models/Transaction.js`:**
   - Change `status` from `DataTypes.STRING` + `validate.isIn` to:
     ```javascript
     status: {
       type: DataTypes.ENUM("pending", "success", "failed", "refunded", "partially_refunded"),
       allowNull: false,
       defaultValue: "pending",
     },
     ```
   - Add at bottom (mirror Order pattern):
     ```javascript
     const statusAttr = Transaction.rawAttributes.status;
     const TRANSACTION_STATUSES = statusAttr?.type?.values ?? [];
     const TRANSACTION_STATUS = Object.fromEntries(TRANSACTION_STATUSES.map((s) => [s.toUpperCase(), s]));
     module.exports.TRANSACTION_STATUSES = TRANSACTION_STATUSES;
     module.exports.TRANSACTION_STATUS = TRANSACTION_STATUS;
     ```

2. **Create migration** (e.g. `xxxxxx-transaction-status-enum.js`):
   - For SQLite: change column type to ENUM (or equivalent; SQLite may need `ALTER` or a new column + backfill).
   - For MySQL/Postgres: use native ENUM if supported.
   - Check Sequelize docs for ENUM migration in your DB.

3. **Update `src/services/order.service.js`:**
   - Remove local `TRANSACTION_STATUS` definition.
   - Add: `const { TRANSACTION_STATUS } = require("../models/Transaction");`
   - Verify all usages (`PENDING`, `SUCCESS`, `FAILED`, etc.) still work.

4. **Update `src/gateways/stripe.gateway.js`** (webhook handler):
   - Import `TRANSACTION_STATUS` from Transaction model.
   - Replace `status: "success"` with `status: TRANSACTION_STATUS.SUCCESS`, etc.
   - Replace `"partially_refunded"` and `"refunded"` with constants.

**Result:** Transaction status defined once in the model; no duplication.

---

### Step 2.3 — Shipping Model: ENUM + Exports

**Goal:** Same pattern as Transaction.

1. **Update `src/models/Shipping.js`:**
   - Change `status` to `DataTypes.ENUM("pending", "dispatched", "delivered")`.
   - Add exports:
     ```javascript
     const statusAttr = Shipping.rawAttributes.status;
     const SHIPPING_STATUSES = statusAttr?.type?.values ?? [];
     const SHIPPING_STATUS = Object.fromEntries(SHIPPING_STATUSES.map((s) => [s.toUpperCase(), s]));
     module.exports.SHIPPING_STATUSES = SHIPPING_STATUSES;
     module.exports.SHIPPING_STATUS = SHIPPING_STATUS;
     ```

2. **Create migration** for Shipping status ENUM.

3. **Optional:** If any code uses shipping status strings, update to use `SHIPPING_STATUS` constants.

**Result:** Shipping status is defined in the model.

---

### Step 2.4 — Currency: Use DEFAULT_CURRENCY Everywhere

**Goal:** No hardcoded `"USD"` across the app.

1. **Import `DEFAULT_CURRENCY`** from `src/config/constants.js` in:
   - `src/views/admin/orders/index.pug` — pass `defaultCurrency` from controller and use `(order.currency || defaultCurrency)`.
   - `src/views/admin/users/form.pug` — same.
   - `src/views/web/checkout.pug` — pass from controller or use `checkoutCurrency || defaultCurrency`.
   - `src/views/web/products/index.pug` — pass from controller.
   - `src/views/web/collections/show.pug` — same.
   - `src/controllers/web/products.controller.js` — `currency: priceRow?.currency || DEFAULT_CURRENCY`.
   - `src/controllers/admin/products.controller.js` — same.
   - `src/repos/productVariant.repo.js` — same.
   - `src/repos/product.repo.js` — same.
   - `src/gateways/stripe.gateway.js` — `(currency || constants.DEFAULT_CURRENCY).toString().toLowerCase()`.

2. **Models** (Order, Transaction, ProductPrice) — keep `defaultValue: "USD"` in schema; it matches the constant. Optionally add a comment: `// Must match DEFAULT_CURRENCY in config/constants.js`.

**Result:** One constant drives all currency fallbacks.

---

## Phase 3: Order Status Consistency

### Step 3.1 — Use ORDER_STATUS in Controllers

**Goal:** Controllers use model constants instead of strings.

1. **Update `src/controllers/web/checkout.controller.js`:**
   - Add: `const { ORDER_STATUS } = require("../../models/Order");`
   - Replace `order.status !== "pending" && order.status !== "failed"` with  
     `order.status !== ORDER_STATUS.PENDING && order.status !== ORDER_STATUS.FAILED`.

2. **Update `src/controllers/web/orders.controller.js`:**
   - Add: `const { ORDER_STATUS } = require("../../models/Order");`
   - Replace `order.status === "pending" || order.status === "failed"` with  
     `order.status === ORDER_STATUS.PENDING || order.status === ORDER_STATUS.FAILED`.
   - Replace `order.status === "pending"` with `order.status === ORDER_STATUS.PENDING`.

3. **Update `src/gateways/stripe.gateway.js`:**
   - Add: `const { ORDER_STATUS } = require("../models/Order");`
   - Replace `order.status !== "pending"` with `order.status !== ORDER_STATUS.PENDING`.
   - Replace `order.status === "paid"` with `order.status === ORDER_STATUS.PAID` in webhook.

**Result:** Status checks use model constants.

---

### Step 3.2 — Order View: Handle All Statuses

**Goal:** `order.pug` handles every status, including `cancelled`.

1. **Update `src/views/web/order.pug`:**
   - Add branch for `order.status === "cancelled"` (or use `ORDER_STATUS.CANCELLED` if passed from controller):
     ```pug
     else if order.status === "cancelled"
       p(style="color:#666") This order has been cancelled.
     ```
   - Optionally pass `ORDER_STATUS` from controller so the view can use constants (Pug can use `statuses.PENDING` etc.).

**Result:** All order statuses are handled in UI.

---

## Phase 4: Cleanup & Consistency

### Step 4.1 — Request Logger / Request ID

**Goal:** Either use request IDs or stop referencing them.

**Option A (recommended):** Enable request logging.
- In `src/app.js`, uncomment `app.use(requestLogger)`.
- Ensures `req.id` is set before error handler runs.

**Option B:** Remove request ID from error responses.
- In `src/middlewares/error.middleware.js`, remove `requestId: req.id` from the payload (or use `req.id || "unknown"`).

**Result:** No undefined `req.id` in error responses.

---

### Step 4.2 — Dead Code: createPaymentIntentForOrder

**Goal:** Remove or use unused gateway method.

**Option A (recommended for now):** Remove it.
- Remove `createPaymentIntentForOrder` from `src/gateways/stripe.gateway.js` (function and exports).
- Remove from `src/gateways/interface.js` if it's part of the interface (or mark as optional/unimplemented).

**Option B:** Keep for future inline payment flow.
- Add a comment: `// Reserved for future inline payment on order page.`
- No changes needed if you plan to use it soon.

**Result:** No dead code or clear intent documented.

---

### Step 4.3 — Dead Config: courses

**Goal:** Remove or deprecate unused config.

1. **Update `src/config/index.js`:**
   - Remove `courses` block, or add a comment and empty object:
     ```javascript
     // Deprecated: courses table removed. Kept for backward compatibility.
     courses: {},
     ```
   - If any code reads `config.courses.cancellationDeadlineHours`, remove or guard with a check.

2. **Remove orphaned CSS** in `src/public/css/account.css`:
   - Remove or repurpose `.courses-list` if unused.

**Result:** Config and CSS match current schema.

---

### Step 4.4 — Account Service Logging

**Goal:** Consistent error logging.

1. **Update `src/services/account.service.js`** (around line 65):
   - Change `logger.warn(..., { userId: user.id, error: claimErr })` to  
     `logger.warn(..., { userId: user.id, error: claimErr?.message })`.

**Result:** Logs use string messages, not full error objects.

---

## Phase 5: Optional Improvements (Lower Priority)

### Step 5.1 — Checkout Idempotency

**Goal:** Reduce risk of duplicate PaymentIntents on double-submit.

1. In `src/controllers/web/checkout.controller.js` `createPaymentIntent`, generate an idempotency key (e.g. `cartId` or `sessionId` + timestamp rounded to last few seconds).
2. Pass it to `gateway.createPaymentIntentForCart(..., { idempotencyKey })`.
3. Stripe gateway already supports `idempotencyKey` in options.

**Result:** Duplicate submissions within a short window retry the same PaymentIntent.

---

### Step 5.2 — Admin User Validation

**Goal:** Reuse auth schema instead of custom validation.

1. In `src/controllers/admin/users.controller.js`, replace `validateUserInput` with:
   - For create: use `auth.schema.validateRegister`-style validation (adapt for optional username for admin-created users).
   - For update: use a schema that allows optional password.
2. Ensure email/username uniqueness and password rules match auth flow.

**Result:** One validation source for user data.

---

### Step 5.3 — Stripe Gateway: stripePaymentIntentId Semantics

**Goal:** Clearer field usage for Checkout Session flow.

1. In `createCheckoutSession`:
   - Optionally store `session.payment_intent` (PaymentIntent ID) instead of `session.id` (Session ID) once the session is created — if Stripe returns it.
   - Or add a comment: `// Temporarily stores session ID; webhook updates to PaymentIntent ID.`
2. Ensures future readers understand the field can hold either a Session or PaymentIntent ID depending on flow.

**Result:** Less confusion about `stripePaymentIntentId` content.

---

## Phase 6: Pre-Deployment Checklist

Before deploying to production:

- [ ] `SESSION_SECRET` set to a strong random value (e.g. `openssl rand -hex 32`).
- [ ] `COOKIE_DOMAIN` set if using a subdomain (e.g. `.yourdomain.com` for shared cookies).
- [ ] `NODE_ENV=production`.
- [ ] Stripe keys and webhook secret configured for production.
- [ ] Database migrations run.
- [ ] No `console.log` of sensitive data; logger used instead.
- [ ] Rate limiting and CSRF enabled (already in place).
- [ ] HTTPS enforced in production.

---

## Execution Order Summary

| Phase | Steps | Est. effort |
|-------|-------|-----------|
| 1 | 1.1, 1.2 | ~30 min |
| 2 | 2.1, 2.2, 2.3, 2.4 | ~2–3 hrs |
| 3 | 3.1, 3.2 | ~45 min |
| 4 | 4.1–4.4 | ~1 hr |
| 5 | 5.1–5.3 | Optional |
| 6 | Checklist | Before deploy |

**Suggested order:** Phase 1 → Phase 2 → Phase 3 → Phase 4. Phase 5 can be done later.

---

## Notes for Ongoing Development

- Keep `SESSION_SECRET` and `COOKIE_DOMAIN` in `.env` for local dev; leave `.env` out of version control.
- Add `PRODUCTION_READINESS.md` or similar to document remaining TODOs if you defer optional items.
- Re-run the audit after major changes to catch regressions.
