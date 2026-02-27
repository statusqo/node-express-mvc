# Physical Product & Checkout Address Implementation Plan

**Status:** Planning  
**Goal:** Add `isPhysical` and `weight` to Product model; conditionally require delivery/billing address at checkout based on cart contents.

---

## 1. Summary of Changes

| Area | Change |
|------|--------|
| **Product model** | Add `isPhysical` (boolean, default `true`), `weight` (decimal, nullable) |
| **Checkout** | If cart has **any** physical product → require delivery & billing. If **all** non-physical → skip address fields |
| **Admin** | Product form: isPhysical checkbox, weight input |

---

## 2. Current State

### 2.1 Product Model
- `products` table: id, title, slug, description, productTypeId, productCategoryId, active
- No `isPhysical` or `weight` fields

### 2.2 Cart & Checkout Flow
- **Cart lines:** `CartLine` → `ProductVariant` → `Product` (id, title, slug). Product has no `isPhysical`/`weight`.
- **Checkout:** Always shows delivery + billing address sections; all fields optional in validator (no server-side required checks).
- **Order creation:** Accepts address fields; stores them on Order (denormalized).

### 2.3 Key Files
- `src/models/Product.js` — Product model
- `src/repos/cart.repo.js` — `defaultLineInclude` fetches Product with `["id", "title", "slug"]`
- `src/controllers/web/checkout.controller.js` — `show`, `placeOrder`, `completeOrder`
- `src/validators/checkout.schema.js` — Zod schema (all optional)
- `src/views/pages/checkout.pug` — Form with delivery/billing sections
- `src/public/js/checkout.js` — Form submit, Stripe integration
- `src/services/order.service.js` — `createOrderFromCart`
- `src/repos/product.repo.js` — create/update
- `src/controllers/admin/products.controller.js` — create/update
- `src/views/admin/products/form.pug` — Product form

---

## 3. Implementation Steps

### Step 1: Database Migration

**File:** `src/db/migrations/YYYYMMDDHHMMSS-add-product-is-physical-and-weight.js`

- Add `isPhysical` BOOLEAN, default `true` (existing products assumed physical)
- Add `weight` DECIMAL(10, 3) nullable (nullable for digital products)
- Add `weightUnit` VARCHAR(10) nullable (g or kg; only for physical products)

```js
await queryInterface.addColumn("products", "isPhysical", {
  type: Sequelize.BOOLEAN,
  allowNull: false,
  defaultValue: true,
});
await queryInterface.addColumn("products", "weight", {
  type: Sequelize.DECIMAL(10, 3),
  allowNull: true,
});
```

---

### Step 2: Product Model

**File:** `src/models/Product.js`

Add:
```js
isPhysical: {
  type: DataTypes.BOOLEAN,
  defaultValue: true,
  allowNull: false,
},
weight: {
  type: DataTypes.DECIMAL(10, 3),
  allowNull: true,
},
```

---

### Step 3: Cart Repo — Include `isPhysical` (and optionally `weight`)

**File:** `src/repos/cart.repo.js`

Update `defaultLineInclude` → Product attributes to include `isPhysical`:
```js
{ model: Product, as: "Product", attributes: ["id", "title", "slug", "isPhysical", "weight"] },
```

---

### Step 4: Checkout Controller — Compute `requiresAddress`

**File:** `src/controllers/web/checkout.controller.js`

In `show`:
- After `lines` are loaded, compute `requiresAddress = lines.some(l => l.ProductVariant?.Product?.isPhysical)`
- Pass `requiresAddress` to the view

In `placeOrder`:
- Before calling `validateCheckout`, fetch cart lines and compute `requiresAddress`
- If `requiresAddress` and validation fails for address fields → redirect with error
- Use a **refined validator** (see Step 5)

In `completeOrder`:
- Same logic: compute `requiresAddress` from cart, then validate accordingly

---

### Step 5: Checkout Validator — Conditional Required

**File:** `src/validators/checkout.schema.js`

Option A: Two schemas
- `CheckoutSchemaBase` — contact fields only (forename, surname, email, mobile)
- `CheckoutSchemaWithAddress` — extends base + required delivery/billing

Option B: Refined validation
- Export `validateCheckout(body, { requiresAddress })`
- If `requiresAddress`:
  - deliveryLine1, deliveryCity, deliveryPostcode, deliveryCountry required
  - billingLine1, billingCity, billingPostcode, billingCountry required (or same-as-delivery handled)
- If not: all address fields optional

**Recommended:** Use `validateCheckout(body, { requiresAddress })` with conditional `.refine()` or separate .required() applied based on flag.

---

### Step 6: Checkout View — Conditionally Show Address Sections

**File:** `src/views/pages/checkout.pug`

- Wrap "Delivery address" section in `if requiresAddress`
- Wrap "Billing address" section in `if requiresAddress`
- When hidden, no `required` on those inputs; form still submits without them

---

### Step 7: Checkout JS — Handle Non-Physical Cart

**File:** `src/public/js/checkout.js`

- Add `data-requires-address` to form (from server-rendered value)
- When `requiresAddress` is false:
  - Address fields are hidden; don't include them in body for complete-order
  - `copyDeliveryToBilling` and `toggleBilling` are irrelevant when address section is hidden
- Form submission: only include address fields in body when `requiresAddress` is true

---

### Step 8: Order Service — Address Optional for Non-Physical

**File:** `src/services/order.service.js`

- `createOrderFromCart` already accepts optional address fields; no change needed
- Address fields are stored as null when not provided — already supported

---

### Step 9: Admin Product Form — Add Fields

**File:** `src/views/admin/products/form.pug`

- Add checkbox: "Physical product" (`name="isPhysical"`, checked when `product.isPhysical !== false`)
- Add input: "Weight (kg)" (`name="weight"`, type="number", step="0.001", optional)

**File:** `src/controllers/admin/products.controller.js`

- In `create`: read `isPhysical`, `weight`; pass to `productRepo.create`
- In `update`: same
- In `editForm`: pass `isPhysical`, `weight` to view

**File:** `src/repos/product.repo.js`

- In `create`: add `isPhysical`, `weight` to Product.create payload
- In `update`: add `isPhysical`, `weight` to payload

---

### Step 10: Helper to Determine `requiresAddress`

**Location:** Either in `cart.service.js` or `checkout.controller.js`

```js
function cartRequiresAddress(lines) {
  if (!lines || lines.length === 0) return false;
  return lines.some(line => {
    const product = line.ProductVariant?.Product;
    return product && product.isPhysical !== false;
  });
}
```

Use this in checkout controller before render and before validation.

---

## 4. Edge Cases

| Scenario | Behavior |
|----------|----------|
| Cart empty | Redirect to /cart before checkout; `requiresAddress` irrelevant |
| All digital | No delivery/billing; order created with null addresses |
| All physical | Require delivery + billing as today |
| Mixed (physical + digital) | Require delivery + billing |
| Product has no `isPhysical` (legacy) | Default `true` from migration; treat as physical |
| Weight | Only relevant for physical; used for shipping calc later (out of scope) |

---

## 5. File Change Summary

| Action | File |
|--------|------|
| **Create** | `src/db/migrations/YYYYMMDDHHMMSS-add-product-is-physical-and-weight.js` |
| **Update** | `src/models/Product.js` |
| **Update** | `src/repos/cart.repo.js` |
| **Update** | `src/repos/product.repo.js` |
| **Update** | `src/controllers/web/checkout.controller.js` |
| **Update** | `src/validators/checkout.schema.js` |
| **Update** | `src/views/pages/checkout.pug` |
| **Update** | `src/public/js/checkout.js` |
| **Update** | `src/controllers/admin/products.controller.js` |
| **Update** | `src/views/admin/products/form.pug` |

---

## 6. Testing Checklist

- [ ] Create physical product → add to cart → checkout → delivery/billing shown and required
- [ ] Create non-physical product → add to cart → checkout → no delivery/billing; order created
- [ ] Mixed cart (physical + digital) → delivery/billing required
- [ ] Admin: create product with isPhysical=off, weight=0; verify saved
- [ ] Admin: create physical product with weight=1.5; verify saved
- [ ] Existing products (after migration) have isPhysical=true by default
- [ ] Payment-first flow (Stripe) works for both physical and non-physical carts
