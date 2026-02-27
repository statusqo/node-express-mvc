# Stripe Implementation – Production Readiness

## 1. Abstraction Layer: `src/gateways/stripe.gateway.js`

- **Single point of Stripe usage**: All Stripe API calls go through the gateway. Use `getDefaultGateway()` or `getGateway('stripe')`; callers use `isConfigured()` and gateway methods only.
- **Amounts**: Amounts are in **major currency units** (e.g. USD dollars). The gateway converts to cents for Stripe (`Math.round(amount * 100)`).
- **Currency**: Stripe expects lowercase (e.g. `usd`); the gateway normalizes with `.toLowerCase()`.
- **Errors**: Gateway uses normalized errors (`gateways/errors.js`); errors expose `err.status` (404, 400, 403, 500). Controllers use `err.status ?? err.statusCode ?? 500` so card declines (402) and invalid requests (400) return correct HTTP status.
- **Production features**: 30s timeouts, structured logging, idempotency keys support, safe identifiers (no raw card data).

## 2. How the Stripe Gateway Is Used

| Caller | Methods used | Purpose |
|--------|----------------|--------|
| **checkout.controller** | `createPaymentIntentForCart`, `validatePaymentIntent`, `savePaymentMethod`, `createCheckoutSession` | Payment-first flow (cart → PaymentIntent → complete order); order payment redirect (Checkout Session); save card after payment |
| **paymentMethods.controller** | `createSetupIntent`, `savePaymentMethod` | Add card (SetupIntent); save PaymentMethod to DB |
| **paymentMethod.service** | `detachPaymentMethod` | Remove card: detach from Stripe when deleting from DB |
| **orders.controller** | `createCheckoutSession` | Redirect to Stripe Checkout for existing order |
| **stripe.controller** | `constructWebhookEvent`, `handleWebhook` | Webhook: verify signature, then process events |

No controller or other service uses the raw Stripe client; all go through the gateway.

## 3. Frontend (Stripe.js)

- **Checkout** (`src/public/js/checkout.js`): Uses **publishable key** only (from `data-stripe-key`). Calls `Stripe()`, `elements()`, `create('card')`, `confirmCardPayment(clientSecret, { payment_method })` or Card Element. No secret key; card data never hits your server.
- **Account – Add card** (`src/public/js/account-payment-methods.js`): Uses publishable key, `confirmCardSetup(clientSecret, { payment_method: { card: cardElement } })`, then POSTs `paymentMethodId` to your server.
- **Config**: Publishable key is injected server-side (e.g. `stripePublishableKey` in templates). CSP in production allows `https://js.stripe.com` and `https://api.stripe.com` (see `app.js`).

## 4. Webhook

- **Route**: `POST /api/stripe/webhook` is registered in **app.js before** `express.json()` / `express.urlencoded()`, with `express.raw({ type: 'application/json' })`, so the body stays raw for signature verification.
- **Verification**: `stripeGateway.constructWebhookEvent(rawBody, signature)` uses `STRIPE_WEBHOOK_SECRET`; invalid signature throws and the controller returns 400.
- **CSRF**: Webhook path is excluded from CSRF (signature is the auth).
- **Idempotency**: In `handleWebhook`, `checkout.session.completed` and `payment_intent.succeeded` skip work if the order is already `paid`.

## 5. Security & Config

- **Secrets**: Stripe secret key and webhook secret come from env (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`). Never log or expose them.
- **Ownership**: PaymentIntent metadata includes `userId` and `sessionId`; `validatePaymentIntentForCompleteOrder` checks them before completing the order. Checkout Session and order payment flows validate order ownership by `userId`/`sessionId`.
- **API version**: Optional `STRIPE_API_VERSION` in env pins the Stripe API version for stable behavior; see `config/index.js` and `stripe.gateway.js`.

## 6. Production Checklist

- [ ] Set `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, and `STRIPE_WEBHOOK_SECRET` in production (use live keys and the live webhook signing secret).
- [ ] Configure the Stripe webhook in the Dashboard to point to `https://yourdomain.com/api/stripe/webhook` and subscribe to: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`.
- [ ] Optionally set `STRIPE_API_VERSION` (e.g. from Stripe Dashboard or SDK) for version pinning.
- [ ] Ensure production CSP (in `app.js`) allows `https://js.stripe.com` and `https://api.stripe.com` as already configured.
- [ ] When implementing refunds, call `gateway.createRefund(paymentIntentId, amount)` from a controller that first checks the user/admin is allowed to refund that order.

## 7. Optional Future Improvements

- **Idempotency keys**: For `createPaymentIntentForCart` (and refunds), you could pass an idempotency key (e.g. from client or derived from session + amount) to Stripe so retries do not create duplicate PaymentIntents.
- **Logging**: Avoid logging full Stripe response objects; current logging uses `err.message` and IDs only, which is safe.
- **Amount precision**: For very large or multi-currency amounts, consider storing/calculating in cents (or using a decimal library) to avoid floating-point issues; current `Math.round(amount * 100)` is acceptable for typical e‑commerce.
