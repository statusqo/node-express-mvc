# Stripe Payment Flow – Testing Guide

Use this guide to test the payment flow slowly and thoroughly for **reliability** and **security** before production.

---

## Prerequisites

1. **Stripe package installed**
   ```bash
   npm install stripe
   ```

2. **Environment variables** in `.env`:
   - `STRIPE_SECRET_KEY=sk_test_...`
   - `STRIPE_PUBLISHABLE_KEY=pk_test_...`
   - `STRIPE_WEBHOOK_SECRET=whsec_...` (from Stripe CLI when running `stripe listen`, or from Dashboard for production)
   - `BASE_URL=http://localhost:8080` (must match how you open the app; used for Stripe redirect URLs)

3. **Stripe CLI** installed and logged in (`stripe login`). Used to forward webhooks to your local app.

4. **Two terminals** (or one for app, one for Stripe CLI):
   - Terminal 1: run the app (`npm run dev` or `node src/server.js`)
   - Terminal 2: run `stripe listen --forward-to localhost:8080/api/stripe/webhook` and leave it running during tests

---

## Phase 1: Pre-flight checks

### 1.1 App starts without errors

```bash
npm run dev
```

- App should start on port 8080 (or your `PORT`).
- No errors about missing Stripe config (warnings are OK if keys are empty; with keys set there should be no Stripe-related errors).

### 1.2 Health / key routes respond

- Open `http://localhost:8080` – home page loads.
- Open `http://localhost:8080/courses` – courses list loads.
- Open `http://localhost:8080/cart` – cart page loads (may be empty).
- Open `http://localhost:8080/checkout` – redirects to `/cart` if cart is empty (expected).

### 1.3 Webhook endpoint rejects invalid requests

With the app running (Stripe CLI can be stopped for this):

```bash
curl -X POST http://localhost:8080/api/stripe/webhook -H "Content-Type: application/json" -d "{}"
```

- **Expected:** `400` with message like `Webhook Error: ...` (signature verification failed).  
- **Security:** Confirms that random POSTs to the webhook are rejected when signature is missing/invalid.

If `STRIPE_WEBHOOK_SECRET` is empty:

- **Expected:** `500` and body like `Webhook secret not configured`.  
- This avoids processing webhooks when the secret is not set.

---

## Phase 2: Happy path (successful payment)

### 2.1 Start webhook forwarding

In a second terminal:

```bash
stripe listen --forward-to localhost:8080/api/stripe/webhook
```

- Note the webhook signing secret (e.g. `whsec_...`).
- Ensure that value is in `.env` as `STRIPE_WEBHOOK_SECRET`, then restart the app so it picks up the secret.

### 2.2 Add course to cart

1. Go to `http://localhost:8080/courses`.
2. Add at least one course to the cart.
3. Open cart: you should see the course and a link to checkout.

### 2.3 Checkout and place order

1. Go to `http://localhost:8080/checkout`.
2. Fill any required fields (e.g. billing/shipping if applicable).
3. Click **Place order**.

**Expected:**

- You are redirected to Stripe Checkout (Stripe’s hosted page).
- URL is something like `https://checkout.stripe.com/...`.

### 2.4 Pay with test card

On Stripe Checkout:

- **Card number:** `4242 4242 4242 4242`
- **Expiry:** any future date (e.g. `12/34`)
- **CVC:** any 3 digits (e.g. `123`)
- **ZIP:** any (e.g. `12345`)

Submit payment.

**Expected:**

- Stripe shows success and redirects you to your app.
- Redirect URL: `http://localhost:8080/orders/<orderId>?session_id=cs_...`

### 2.5 Order page and webhook

1. On the order page you should see a **success** state (order paid, not “Pay with Stripe”).
2. In the **Stripe CLI** terminal you should see at least one forwarded event (e.g. `checkout.session.completed` or `payment_intent.succeeded`) with `200` response.
3. App logs should show no errors for the webhook.

### 2.6 Verify data (logged-in user)

If you were logged in:

1. Go to **Account** (or your account/registrations page).
2. You should see the purchased course(s) as registered.
3. In the database (if you check): order status `paid`, transaction status `success`, and registrations created for the order lines.

**Checklist:**

- [ ] Redirect to Stripe Checkout works
- [ ] Payment with `4242...` succeeds
- [ ] Redirect back to `/orders/:id` with success
- [ ] Order shows as paid on order page
- [ ] Webhook receives event(s) and returns 200
- [ ] Order status and registrations correct in app/DB

---

## Phase 3: Failed payment

### 3.1 Create a new order

1. Add another course to cart (or use a new session).
2. Go to checkout and place order again (new order).

### 3.2 Use failing test card

On Stripe Checkout:

- **Card number:** `4000 0000 0000 0002` (Stripe test card that always fails).

**Expected:**

- Stripe shows a decline/failure message.
- User can try again or go back; they are not redirected to success.
- Optionally: user can later open the order page and see “Retry payment” or similar.

### 3.3 Webhook for failure

- Stripe may send `payment_intent.payment_failed`.
- Stripe CLI should show the event and your app should return `200`.
- In DB: order can stay `pending` and transaction can be `failed` (depending on your logic).

**Checklist:**

- [ ] Declined card does not mark order as paid
- [ ] Webhook for failure is received and returns 200
- [ ] Order/transaction state reflects failure (e.g. retry available)

---

## Phase 4: Webhook reliability and security

### 4.1 Signature verification

- Already checked in Phase 1.3: POST without valid signature → `400`.
- Do **not** disable signature verification in production.

### 4.2 Idempotency (duplicate events)

Stripe may send the same event more than once. The app should:

- Not create duplicate registrations.
- Not fail when processing the same event twice.

**Quick check:** Trigger one successful payment; in Stripe CLI, optionally resend the same event (e.g. `stripe events resend evt_...`). App should return `200` and order/registrations should be unchanged (no duplicates, no errors).

### 4.3 Webhook secret

- With **wrong** secret in `.env`: Stripe CLI uses a different secret → your app should return `400` (signature verification failed).
- With **correct** secret from `stripe listen`: events should be accepted and return `200`.

---

## Phase 5: Retry payment (pending / failed order)

1. Have an order that is **pending** or **failed** (e.g. from Phase 3).
2. Open the order page: `http://localhost:8080/orders/<orderId>`.
3. Click **Pay with Stripe** or **Retry payment**.

**Expected:**

- Redirect to Stripe Checkout for the same order.
- After successful payment, same checks as Phase 2: redirect back, order paid, webhook 200, registrations updated.

---

## Phase 6: Security checklist

- [ ] Webhook route uses **raw body** for signature verification (configured in `app.js` before `express.json()`).
- [ ] **No** CSRF on webhook route (Stripe uses signature, not cookies).
- [ ] **Secret key** only in server env (`.env`), never in frontend or logs.
- [ ] **Publishable key** can be in frontend (e.g. order page); no secrets there.
- [ ] Logs do **not** print full card numbers, webhook payloads, or `STRIPE_WEBHOOK_SECRET`.
- [ ] In production: **HTTPS** and a **Dashboard webhook** endpoint with correct signing secret (not only Stripe CLI).

---

## Phase 7: Refund / cancellation (if implemented)

1. As a logged-in user, complete a payment and get a registration.
2. From account/registrations, cancel the course (within your cancellation window).
3. **Expected:** Refund is created in Stripe; `charge.refunded` webhook is received; transaction/order state updated (e.g. refunded/partially_refunded); no errors in logs.

---

## Summary

| Phase              | Focus                    |
|--------------------|--------------------------|
| 1. Pre-flight      | App starts, routes, webhook rejects invalid |
| 2. Happy path      | Full flow: cart → checkout → Stripe → success → order & registrations |
| 3. Failed payment  | Declined card, correct state and optional retry |
| 4. Webhooks        | Signature verification, idempotency, correct secret |
| 5. Retry payment   | Pending/failed order can be paid again |
| 6. Security        | No secrets in frontend/logs, HTTPS in production |
| 7. Refund          | Cancellation triggers refund and webhook handling |

Run through each phase in order; fix any failing step before moving on. When all phases pass, the flow is in good shape for production-grade reliability and security.
