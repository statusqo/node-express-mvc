# Stripe Integration Setup Guide

## 1. Install Stripe Package

```bash
npm install stripe
```

## 2. Configure Stripe API Keys

Add your Stripe API keys to `.env`:

```env
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

### Getting Your Stripe Keys:

1. **Secret Key & Publishable Key:**
   - Go to [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys)
   - Copy your **Test** keys (for development) or **Live** keys (for production)
   - `STRIPE_SECRET_KEY` = Secret key (starts with `sk_test_` or `sk_live_`)
   - `STRIPE_PUBLISHABLE_KEY` = Publishable key (starts with `pk_test_` or `pk_live_`)

2. **Webhook Secret:**
   - Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/test/webhooks)
   - Click "Add endpoint"
   - Endpoint URL: `https://yourdomain.com/api/stripe/webhook` (or `http://localhost:8080/api/stripe/webhook` for local testing)
   - Select events to listen to:
     - `checkout.session.completed`
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
     - `charge.refunded`
   - Copy the **Signing secret** (starts with `whsec_`)

## 3. Testing Locally with Stripe CLI

For local development, use Stripe CLI to forward webhooks:

```bash
# Install Stripe CLI: https://stripe.com/docs/stripe-cli
stripe listen --forward-to localhost:8080/api/stripe/webhook
```

This will give you a webhook signing secret - use that in your `.env` for local testing.

## 4. Payment Flow

### User Journey:
1. User adds courses to cart
2. User goes to `/checkout`
3. User fills billing/shipping address (if logged in)
4. User clicks "Place order"
5. **Order is created** → User is **redirected to Stripe Checkout** (Pay-as-you-go)
6. User completes payment on Stripe's hosted page
7. User is redirected back to `/orders/:id` with success
8. **Stripe webhook** updates order status and creates registrations

### Order Page:
- **Pending orders**: Show "Pay with Stripe" button
- **Paid orders**: Show success message
- **Failed orders**: Show retry payment button

## 5. Webhook Events Handled

- `checkout.session.completed` - Payment successful, mark order as paid, create registrations
- `payment_intent.succeeded` - Backup handler for payment success
- `payment_intent.payment_failed` - Mark transaction as failed
- `charge.refunded` - Update transaction status to refunded/partially_refunded

## 6. Refunds

When a user cancels a course registration:
- Refund is automatically created via Stripe API
- Refund transaction is recorded in database
- Webhook will update refund status when Stripe processes it

## 7. Important Notes

- **Pay-as-you-go**: Uses Stripe's domain (`checkout.stripe.com`) - no monthly fee
- **Webhook security**: Uses Stripe signature verification (bypasses CSRF)
- **Customer management**: Creates Stripe Customer for logged-in users (for future saved payment methods)
- **Guest checkout**: Supported - Stripe collects email during checkout

## 8. Testing

1. Use Stripe test cards: https://stripe.com/docs/testing
2. Test successful payment: `4242 4242 4242 4242`
3. Test failed payment: `4000 0000 0000 0002`
4. Check webhook events in Stripe Dashboard → Webhooks → [Your endpoint] → Events
