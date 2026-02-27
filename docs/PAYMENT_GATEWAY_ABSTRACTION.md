# Payment Gateway Abstraction

This document describes the payment gateway abstraction and how to add a new gateway (e.g. Mollie).

## Architecture

- **`src/gateways/`** – Gateway implementations and shared types
  - `errors.js` – Normalized error format `{ code, message, gatewayCode?, retryable }`
  - `interface.js` – JSDoc interface for gateway methods
  - `stripe.gateway.js` – Stripe implementation
  - `index.js` – Factory: `getGateway(name)`, `getDefaultGateway()`, `validatePaymentConfig()`

- **Consumers** use `getDefaultGateway()` or `getGateway('stripe')` for all Stripe payment operations.

- **Webhooks** remain gateway-specific (e.g. `POST /api/stripe/webhook`) but delegate to the gateway’s `constructWebhookEvent` and `handleWebhook`.

## Adding a New Gateway (e.g. Mollie)

1. **Create `src/gateways/mollie.gateway.js`**
   - Implement: `name()`, `isConfigured()`, `createPaymentIntentForCart`, `createSetupIntent` (if supported), `createCheckoutSession` (if supported), `savePaymentMethod`, `detachPaymentMethod`, `validatePaymentIntent`, `getPaymentMethodDetails`, `constructWebhookEvent`, `handleWebhook`
   - Use `normalizeError()` from `./errors` for all errors
   - Use `withTimeout()` (or equivalent) for 30s timeouts
   - Use `logPaymentOp()` for structured logging (no raw card data)

2. **Register in `src/gateways/index.js`**
   - Add `case 'mollie':` in `getGateway()` and return the Mollie gateway if configured

3. **Config**
   - Add Mollie env vars in `src/config/index.js` (e.g. `MOLLIE_API_KEY`)
   - Add `PAYMENT_DEFAULT_GATEWAY=mollie` to use Mollie as default

4. **Webhook route**
   - Add `POST /api/mollie/webhook` in `app.js` (before body parsing, with `express.raw()`)
   - Verify Mollie webhook signature in `constructWebhookEvent`

5. **Database**
   - `user_gateway_profiles` already supports multiple gateways (unique `userId` + `gateway`)
   - `payment_methods.gateway` stores which gateway each card belongs to

## Error Codes (Normalized)

- `card_declined`, `insufficient_funds`, `authentication_required` – user-facing
- `rate_limit`, `network_error` – retryable
- `invalid_request`, `unauthorized`, `not_found`, `unknown` – other

## Testing Webhooks

- **Stripe**: Use [Stripe CLI](https://stripe.com/docs/stripe-cli) to forward webhooks:
  ```bash
  stripe listen --forward-to localhost:8080/api/stripe/webhook
  ```
