# Checkout, Orders & Cart – Design and Integration

## 1. Attend course only if purchased (pay before register)

**Rule:** A user can only be **registered** for a course if they have a **paid** order that includes that course.

**Implementation:**
- **Registration** remains the link between User and Course (attendance).
- **Order** and **OrderLine** record what was purchased. When an order is paid, the app creates **Registration**(s) for each course in the order (for that user). No separate “register for course” action without a prior purchase.
- **Service layer:** “Register for course” checks for a paid OrderLine for that (user, course) before creating a Registration; otherwise it returns an error. Alternatively, registrations are only created automatically when an order is marked paid (recommended).

**Changes:** Add `orderLineId` (nullable) to **Registration** to record which purchase led to this registration (audit trail). Business rule enforced in **registration.service** (and when confirming payment in **order.service**).

---

## 2. Orders table (no User–Order join table)

**Correct:** One user has many orders; each order belongs to one user. So **User hasMany Order**, **Order belongsTo User**. No join table.

**Additional:** Orders can also be created by **guests** (no user account). So **Order** has:
- `userId` (nullable) – set when the buyer is logged in.
- `sessionId` (nullable) – set for guest checkout; at least one of `userId` or `sessionId` must be set.

**Order** also has: status, total, currency, billingAddressId, shippingAddressId (optional), timestamps.

---

## 3. Each payment attempt stored (Transactions table)

**Transaction** stores every attempt to pay (success or failure):
- `orderId`, `amount`, `currency`, `status` (e.g. pending, success, failed), `gateway`, `gatewayReference`, optional `metadata` (JSON), timestamps.

**Flow:** When the app calls the payment gateway, it creates a Transaction (e.g. status pending). On callback or polling, it updates the Transaction and, on success, marks the Order as paid and creates Registrations (and optionally Shipping).

**Repos:** transaction.repo (create, update, findByOrder, etc.). **Services:** order.service (or payment.service) creates/updates transactions and applies order/registration logic.

---

## 4. Cart and CartLine (add course to cart)

**Cart:** One per user or one per guest (session).
- `userId` (nullable), `sessionId` (nullable). At least one required. Unique index on `sessionId` where sessionId is not null so one cart per guest session.

**CartLine:** Join between Cart and Course (cart_lines).
- `cartId`, `courseId`, `quantity` (default 1), timestamps. Unique (cartId, courseId) so one line per course per cart.

**Flow:** Route → CartController → cart.service → cart.repo (+ course.repo for price/validation). Middleware: optional requireAuth (if cart is user-specific) or use session for guest.

---

## 5. Guest checkout (session IDs on Cart and Order) – rating

**Approach:** Use `sessionId` on **Cart** and **Order** for guests; keep `userId` nullable.

**Rating: Good and production-ready.**

**Pros:**
- One cart per guest session; no account required to add to cart or pay.
- Same schema supports both guest and logged-in users (Cart/Order have either sessionId or userId).
- When a guest later registers, you can run a “link guest data to user” step: update Cart and Order rows with that sessionId to set userId and clear or keep sessionId for audit.

**Considerations:**
- Use a long, unguesable session ID (express-session does this).
- Don’t expose raw session IDs in URLs; use session cookie only.
- Optional: periodic job to delete old guest carts/orders by sessionId to avoid clutter.

**Implementation:** Cart and Order both have `userId` (nullable) and `sessionId` (nullable). Application code enforces “at least one of userId or sessionId” in service layer; DB can use a check constraint if the dialect supports it.

---

## 6. Address model (billing & shipping)

**Address** stores a single address (billing or shipping).
- Fields: userId (nullable for one-off guest addresses), label (e.g. “Home”, “Billing”), line1, line2, city, state, postcode, country, isDefault (for user’s saved addresses).
- **User hasMany Address**; **Order** has billingAddressId and shippingAddressId (FK to Address). For guests, create Address rows with userId null and link only to Order.

**Repo:** address.repo. **Service:** address.service (CRUD; “my addresses” for logged-in user; create one-off for guest at checkout).

---

## 7. Shipping model (future physical materials)

**Shipping** represents one shipment for an order (e.g. educational materials).
- `orderId`, `addressId` (where to ship), carrier, trackingNumber, status (e.g. pending, dispatched, delivered), shippedAt, deliveredAt, timestamps.

**Order hasMany Shipping** (one order can have multiple parcels); **Shipping belongsTo Order** and **belongsTo Address**.

**Usage:** When an order is paid and includes physical goods, create a Shipping record; update status and tracking when shipped/delivered. No change to course access logic.

---

## 8. Payment methods (saved cards, etc.)

**PaymentMethod** for logged-in users only:
- userId, type (e.g. card, bank), gatewayToken (e.g. Stripe payment method id), last4, brand, expiryMonth, expiryYear, isDefault, timestamps.

**User hasMany PaymentMethod.** At checkout, user can choose a saved method; the app uses the gatewayToken to charge. No PCI storage—only gateway tokens and display info.

**Repo:** paymentMethod.repo. **Service:** paymentMethod.service (list, add, setDefault, remove); called from profile/settings and checkout.

---

## Architecture (Route → Controller → Service → Repo → Model)

- **Routes:** Define admin and app routes (e.g. `/cart`, `/checkout`, `/orders`, `/account/addresses`, `/account/payment-methods`).
- **Controllers:** Parse request (body/params/query), call one or more **services**, set response (redirect/JSON/render). No direct DB or model access.
- **Services:** Enforce business rules (e.g. cart must have userId or sessionId; registrations created only when order is paid), orchestrate repos, transactions, and side effects (e.g. clear cart after order creation).
- **Repos:** CRUD and queries only (findByPk, findByUser, findBySession, create, update, delete). Only layer that uses Sequelize models/DB.
- **Middleware:** `requireAuth` for protected routes; optional `attachCart` (resolve cart by session or user and set `req.cart`) for cart/checkout routes.

### Implemented services

| Service | Purpose |
|--------|---------|
| `cart.service` | getOrCreateCart, getCartWithLines, addToCart, removeFromCart, setQuantity (uses userId or sessionId). |
| `order.service` | createOrderFromCart (in a transaction), recordPaymentAttempt, recordPaymentSuccess (marks order paid, creates Registrations for user), recordPaymentFailed, getOrderById. |
| `address.service` | listByUser, getById, create, update, remove (owned by user or one-off for guest). |
| `paymentMethod.service` | listByUser, getById, create, setDefault, remove (user-only). |

Registration for a course is **not** created by a separate “register” action; it is created automatically in `order.service.recordPaymentSuccess` when the order has a `userId`. Guest orders remain with only `sessionId` until the guest registers and you optionally link orders to the new user.

---

## New tables summary

| Table            | Purpose                                      |
|------------------|----------------------------------------------|
| addresses        | Billing/shipping; userId null for guest      |
| carts            | One per user or per session                  |
| cart_lines       | Cart ↔ Course; quantity per course           |
| orders           | One per purchase; userId or sessionId        |
| order_lines      | Order ↔ Course; price snapshot, quantity     |
| transactions     | Each payment attempt for an order            |
| shippings        | Per-order shipment (address, tracking)       |
| payment_methods  | Stored payment methods (user-only)           |
| registrations    | Add column orderLineId (nullable)            |

All new tables use UUID primary keys and timestamps to match existing style.
