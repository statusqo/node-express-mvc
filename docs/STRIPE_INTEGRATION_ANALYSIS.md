# Stripe Integration Analysis

## Current Model Compatibility

### ✅ Transaction Model - **Good, Minor Enhancement Needed**

**Current fields:**
- `gateway` - ✅ Can store "stripe"
- `gatewayReference` - ✅ Can store Stripe Payment Intent ID (`pi_...`), Charge ID (`ch_...`), or Refund ID (`re_...`)
- `metadata` - ✅ Can store full Stripe webhook event data as JSON
- `status` - ⚠️ Currently: `["pending", "success", "failed"]`
- `amount` - ✅ Supports negative values (good for refunds)

**Recommended enhancement:**
- Add `"refunded"` and `"partially_refunded"` to Transaction status enum (optional - can also track via metadata)

### ✅ Order Model - **Good, Optional Enhancement**

**Current fields:**
- `status` - ✅ Already has `"refunded"` status
- `currency` - ✅ Perfect for Stripe
- `total` - ✅ Perfect for Stripe

**Optional enhancement:**
- Add `stripePaymentIntentId` field (nullable STRING) for easier webhook handling
  - Makes it easier to find orders from Stripe webhook events
  - Not strictly necessary (can query transactions by gatewayReference)

### ✅ PaymentMethod Model - **Perfect as-is**

**Current fields:**
- `gatewayToken` - ✅ Perfect for Stripe Payment Method ID (`pm_...`)
- `type` - ✅ Can store "card", "bank_account", etc.
- `last4` - ✅ Stripe provides this
- `brand` - ✅ Stripe provides card brand (visa, mastercard, etc.)
- `expiryMonth` / `expiryYear` - ✅ Stripe provides these

### ⚠️ User Model - **Consider Adding Stripe Customer ID**

**Recommendation:**
- Add `stripeCustomerId` field (nullable STRING) to User model
  - Stripe Customer ID (`cus_...`) allows you to:
    - Store payment methods for future use
    - Track customer payment history
    - Enable subscriptions (if needed later)
  - Optional but highly recommended for better Stripe integration

## Recommended Changes

### 1. Transaction Status Enhancement (Optional)
```javascript
// In Transaction model
status: {
  type: DataTypes.STRING,
  allowNull: false,
  defaultValue: "pending",
  validate: {
    isIn: [["pending", "success", "failed", "refunded", "partially_refunded"]],
  },
}
```

### 2. Order Model - Add Stripe Payment Intent ID (Recommended)
```javascript
// Add to Order model
stripePaymentIntentId: {
  type: DataTypes.STRING,
  allowNull: true,
}
// Add index for faster webhook lookups
indexes: [
  { fields: ["stripePaymentIntentId"] },
  // ... existing indexes
]
```

### 3. User Model - Add Stripe Customer ID (Highly Recommended)
```javascript
// Add to User model
stripeCustomerId: {
  type: DataTypes.STRING,
  allowNull: true,
  unique: true,
}
```

## Stripe Integration Flow

### Payment Flow:
1. **Create Payment Intent** → Store `paymentIntent.id` in Order.stripePaymentIntentId
2. **Create Transaction** → Set `gateway: "stripe"`, `gatewayReference: paymentIntent.id`, `status: "pending"`
3. **Webhook: payment_intent.succeeded** → Update Transaction to `status: "success"`, call `order.service.recordPaymentSuccess()`
4. **Webhook: payment_intent.payment_failed** → Update Transaction to `status: "failed"`, call `order.service.recordPaymentFailed()`

### Refund Flow:
1. **Create Refund via Stripe API** → Create Transaction with negative amount, `gatewayReference: refund.id`
2. **Webhook: charge.refunded** → Update Transaction status to `"refunded"` or `"partially_refunded"`

## Payment Link Question: Pay-as-you-go vs Custom Domain

### **Recommendation: Start with Pay-as-you-go**

**Pay-as-you-go (Stripe Checkout):**
- ✅ **No monthly fee** - Only pay transaction fees (1.4% + 20p for UK cards)
- ✅ Uses Stripe's domain (`checkout.stripe.com`) - fully trusted by customers
- ✅ Zero setup cost - just API keys
- ✅ Can upgrade to Custom Domain later without code changes
- ✅ Stripe handles PCI compliance, security, and updates
- ⚠️ URL shows `checkout.stripe.com` (but customers trust Stripe)

**Custom Domain:**
- ❌ **£10/month** fixed cost + transaction fees
- ✅ Uses your domain (`checkout.yourdomain.com`)
- ✅ Better branding
- ⚠️ Requires DNS setup and domain verification
- ⚠️ Still uses Stripe infrastructure (just branded)

**Verdict:** Start with Pay-as-you-go. The £10/month savings is significant when starting out, and you can always upgrade later. The Stripe domain is trusted by customers and won't hurt conversion rates. Only upgrade to Custom Domain when:
- You're processing enough volume that £10/month is negligible
- Brand consistency becomes critical
- You have budget for it

## Next Steps

1. Create migration to add `stripePaymentIntentId` to Order (recommended)
2. Create migration to add `stripeCustomerId` to User (highly recommended)
3. Optionally enhance Transaction status enum
4. Stripe is implemented via gateway layer (stripe.gateway.js) for:
   - Creating payment intents
   - Handling webhooks
   - Creating refunds
   - Managing customers
