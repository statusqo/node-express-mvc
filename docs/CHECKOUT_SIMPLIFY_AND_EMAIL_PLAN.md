# Checkout simplification and order confirmation email – implementation plan

## Overview

1. **Simplify checkout**: create orders only when payment succeeds (payment-first only).
2. **Order confirmation email**: send email when an order is paid (guests and logged-in users).
3. **Email testing**: how to verify emails are sent.

---

## Current state

### Email service (`src/services/email.service.js`)

- **Nodemailer**: already installed (`^7.0.12` in `package.json`).
- **Existing**: `sendContactEmail` for contact form.
- **Config**: `config.mail` (from `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `MAIL_TO`).
- **Guard**: `ensureMailConfig()` throws if required vars are missing.

### Checkout flows

| Flow | How it works | Order created |
|------|--------------|---------------|
| **Payment-first** (main) | Checkout form → JS → `createPaymentIntent` → Stripe.js → `completeOrder` | Only on payment success ✓ |
| **Order-first** (fallback) | Form POST → `placeOrder` → creates order → redirect to `/orders/:id?pay=1` → Stripe Checkout | **Before** payment ✗ |

The main checkout uses the payment-first flow. The order-first flow is used when:

- JS is disabled (form submits to `POST /checkout`), or
- Stripe is not configured (no JS handler is attached).

### Stripe webhooks

- `checkout.session.completed`: expects `orderId` in metadata; marks existing order as paid.
- `payment_intent.succeeded`: finds order by `stripePaymentIntentId`; marks it paid.
- Both assume an order already exists.

---

## Step-by-step implementation plan

### Phase 1: Add order confirmation email

**1.1** Add `sendOrderConfirmationEmail` to `src/services/email.service.js`:

```javascript
async function sendOrderConfirmationEmail({ orderId, to, forename, lines, total, currency }) {
  const transporter = getTransporter();
  const safeTo = sanitizeHeaderValue(to);
  const safeForename = sanitizeHeaderValue(forename || "Customer");
  // Build plain text body: order ID, items, total.
  const linesText = (lines || []).map(l => `- ${l.title || 'Item'} × ${l.quantity || 1} @ ${l.price}`).join('\n');
  const text = `Hi ${safeForename},\n\nThank you for your order #${orderId}.\n\nItems:\n${linesText}\n\nTotal: ${total} ${currency}\n\n...`;
  await transporter.sendMail({
    from: config.mail.from,
    to: safeTo,
    subject: `Order confirmation #${orderId}`,
    text,
  });
}
```

- Export it alongside `sendContactEmail`.
- Use `order.email` for guests; for logged-in users, prefer `user.email` if available.
- Call `ensureMailConfig()` only when sending (same as contact form). If email is not configured, log a warning and do not throw so checkout still succeeds.

**1.2** Decide on “email not configured” behavior:

- **Option A**: Log warning, skip sending, continue checkout. (Recommended for dev.)
- **Option B**: Throw and fail checkout if email is required. (Strict production.)

**1.3** Normalize line data for the template:

- Use `orderRepo.getLines(order.id)` and derive `{ title, quantity, price }` from each line (ProductVariant/Product snapshot).

---

### Phase 2: Integrate email into order completion

**2.1** In `completeOrder` (`src/controllers/web/checkout.controller.js`):

- After `recordPaymentSuccess` and before `return res.json(...)`:
  - Load order with lines: `orderRepo.getLines(order.id)`.
  - Determine recipient: `order.email` (guest) or `req.user?.email` (logged-in).
  - Call `emailService.sendOrderConfirmationEmail(...)` inside a try/catch.
  - Log success/failure; do not fail the request if email fails.

**2.2** In Stripe webhook (`src/gateways/stripe.gateway.js`):

- In `checkout.session.completed` and `payment_intent.succeeded`, after `recordPaymentSuccess`:
  - Load order and lines.
  - Call `sendOrderConfirmationEmail` for the same recipient logic.
  - Use try/catch and log; do not fail webhook handling.

**2.3** Avoid duplicate emails:

- `completeOrder` is the primary path for the payment-first flow.
- Webhook may run before or after `completeOrder`. Use a flag or guard so we send the email only once (e.g. “email sent” flag on order, or send only from `completeOrder` and let webhook be backup for orphaned payments). For simplicity, you can send from both and accept rare duplicates, or add `orderConfirmationSentAt` to the Order model and check it before sending.

---

### Phase 3: Remove order-first flow

**3.1** Remove or repurpose `placeOrder`:

- **Option A (recommended)**: Remove `POST /checkout` route. If the form submits (no JS), redirect to checkout with “Please enable JavaScript to complete checkout” or similar.
- **Option B**: Keep route but return 503 with “Payment system is required” when Stripe is not configured.

**3.2** Change checkout form behavior when Stripe is not configured:

- In `checkout.show`, if `!stripePublishableKey`, render a message like “Payment is not configured. Please contact support.” and do not show the Place order button (or disable it).

**3.3** Remove `?pay=1` redirect from `orders.show`:

- The `?pay=1` logic was for the order-first flow. After removing it, users no longer land on `/orders/:id?pay=1` right after placing an order.
- Payment-first flow redirects to `/orders/:id` after `completeOrder` (already paid).

**3.4** Decide on `payOrder` and Stripe Checkout redirect:

- `payOrder` (`POST /checkout/pay/:id`) pays an existing pending order via Stripe Checkout.
- If we no longer create pending orders, this is only for legacy orders.
- **Recommendation**: Keep `payOrder` for backward compatibility.
- `checkout.session.completed` webhook will still handle these; ensure order confirmation email is sent there too.

**3.5** Update checkout frontend:

- Ensure the form always uses JS (createPaymentIntent + completeOrder). When Stripe is not configured, show an error and do not allow submission.
- Remove or repurpose the form `action="/checkout"` so it does not trigger `placeOrder`.

---

### Phase 4: Webhook edge case (optional)

If the client crashes after payment but before `completeOrder`:

- `payment_intent.succeeded` fires, but no order exists yet.
- PaymentIntent metadata has `userId` and `sessionId`.
- You could create the order from the cart (by sessionId) in the webhook. This requires storing enough metadata and handling cart lookup by session. Mark as optional for v1.

---

## How to test that emails are sent

### 1. Ethereal (fake SMTP, no real delivery)

```bash
# Create test account at runtime (or use fixed test account)
node -e "
const nodemailer = require('nodemailer');
nodemailer.createTestAccount().then(acc => {
  console.log('User:', acc.user);
  console.log('Pass:', acc.pass);
  console.log('SMTP:', 'smtp.ethereal.email:587');
});
"
```

- Set `.env`:
  - `SMTP_HOST=smtp.ethereal.email`
  - `SMTP_PORT=587`
  - `SMTP_SECURE=false`
  - `SMTP_USER=<from output>`
  - `SMTP_PASS=<from output>`
  - `MAIL_FROM=noreply@yoursite.com`
  - `MAIL_TO=admin@example.com`
- Run checkout. Open Ethereal inbox: https://ethereal.email/messages

### 2. Mailtrap

- Sign up at https://mailtrap.io
- Add an inbox, copy SMTP credentials
- Configure `.env` with Mailtrap’s host, port, user, pass
- Emails appear in the Mailtrap inbox

### 3. Mailhog (local)

- Run: `docker run -p 1025:1025 -p 8025:8025 mailhog/mailhog`
- SMTP: `localhost:1025`, no auth
- Web UI: http://localhost:8025

### 4. Logging fallback (development)

- Add a “dry run” mode: if `MAIL_DRY_RUN=true`, log the email instead of sending:
  - `logger.info("Email would send", { to, subject, textPreview })`
- Lets you verify the flow without real SMTP.

### 5. Recommended `.env.example` additions

```env
# Email (optional – used for contact form and order confirmation)
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
MAIL_FROM=noreply@example.com
MAIL_TO=admin@example.com

# Set to "true" to log emails instead of sending (development)
MAIL_DRY_RUN=false
```

---

## Summary

| Step | Action |
|------|--------|
| 1 | Add `sendOrderConfirmationEmail` to `email.service.js` |
| 2 | Call it from `completeOrder` after payment success |
| 3 | Call it from Stripe webhooks when marking orders paid |
| 4 | Remove `placeOrder` route and `?pay=1` redirect |
| 5 | When Stripe not configured, show error on checkout |
| 6 | Test with Ethereal, Mailtrap, or Mailhog |

---

## Files to touch

- `src/services/email.service.js` – add `sendOrderConfirmationEmail`
- `src/controllers/web/checkout.controller.js` – remove/change `placeOrder`, add email call in `completeOrder`
- `src/gateways/stripe.gateway.js` – add email call in webhooks
- `src/routes/web/checkout.routes.js` – remove or change `POST /`
- `src/controllers/web/orders.controller.js` – remove `?pay=1` redirect logic
- `src/views/web/checkout.pug` – handle “Stripe not configured”
- `src/public/js/checkout.js` – ensure form never submits when Stripe missing (already prevents default when Stripe exists)
- `.env.example` – add mail vars and `MAIL_DRY_RUN`
