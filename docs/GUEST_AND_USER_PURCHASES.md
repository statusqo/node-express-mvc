# Guest vs Registered User Purchases — Recommendation

## Current state

| Area | Guests | Registered users |
|------|--------|-------------------|
| **Cart** | Cart by `sessionId` | Cart by `userId` |
| **Order** | Order with `sessionId`, `userId = null` | Order with `userId` (and optionally `sessionId`) |
| **Stripe** | No `customer_id` → Stripe collects email on checkout | `customer_id` from User’s `stripeCustomerId` |
| **Registrations** | **Not created** (no user to attach to) | Created in `recordPaymentSuccess` |

So today:

- **Guests** can add to cart, checkout, and pay, but:
  - No course registrations are created.
  - They have no “My courses” or attendance record.
  - If they register later, their paid order is not linked to their account.

- **Registered users** get orders, Stripe customer, and registrations as expected.

The `stripeCustomerId` on User is only for **logged-in** checkout; it does not block guest checkout. Guest vs user is already distinguished by Cart/Order having `userId` or `sessionId`. The missing piece is giving guests a way to **attend** courses (and optionally link the purchase to an account later).

---

## Recommended approach: “Guest checkout + claim on register”

Keep the existing behaviour (cart/order/Stripe) and add:

1. **Store guest email on the order** when Stripe tells us (from checkout session).
2. **Auto-claim when email matches a user** (in webhook): if the guest email is already in `users`, attach the order to that user and create registrations.
3. **Claim on registration**: when someone registers with an email that has paid guest orders, attach those orders to the new user and create registrations.

Result:

- **Guests** can buy; we store their email on the order; if they already have an account we auto-link; if not, they can register later and then “claim” (see courses in Account).
- **Registered users** keep current behaviour (Stripe customer, registrations on payment).
- **Attendance** is always represented as **Registrations** tied to a **User** (no need for `userId = null` on Registration).

---

## Implementation outline

### 1. Order: add `guestEmail`

- **Migration:** add nullable `guestEmail` (STRING) to `orders`.
- **Model:** add `guestEmail` to `Order.js`.
- **Purpose:** For guest orders, store the payer email from Stripe so we can:
  - Auto-claim if that email is already a user.
  - Let new users claim orders when they register with that email.

### 2. Webhook: `checkout.session.completed`

After marking the order paid and updating the transaction:

- **If `order.userId` is set**  
  - Call `recordPaymentSuccess(transaction.id, order.userId)` as today (creates registrations).

- **If `order.userId` is null (guest):**
  - Read guest email from Stripe:
    - Prefer `session.customer_details?.email` or `session.customer_email` (Stripe Checkout often fills this).
  - Save it: `orderRepo.update(orderId, { guestEmail: email })`.
  - **Auto-claim:**  
    - Find user by email: `user = userRepo.findByEmail(email)`.  
    - If found:  
      - `orderRepo.update(orderId, { userId: user.id, guestEmail: null })` (optional: clear `guestEmail` once claimed).  
      - Create registrations for that order (same logic as `recordPaymentSuccess` for that order + user), or call a small helper that does “create registrations for this order for this user” so you don’t duplicate logic.

So:

- Registered user → same as now (registrations created in `recordPaymentSuccess`).
- Guest, email matches user → attach order to user and create registrations in webhook.
- Guest, email does not match any user → order stays with `sessionId` + `guestEmail`; no registrations yet; they will be created when they register (see below).

### 3. Registration: “claim” guest orders by email

When a **new user** is created (e.g. in `account.service.register` after `userRepo.create`):

- Call a new function, e.g. `orderService.claimGuestOrdersByEmail(userId, email)`.
- Implementation:
  - Find orders where `guestEmail = email` (normalised), `userId IS NULL`, `status = 'paid'`.
  - For each such order:
    - `orderRepo.update(orderId, { userId, guestEmail: null })`.
    - Create registrations for that order’s lines for this `userId` (same “create registrations for order + user” logic as in `recordPaymentSuccess` / webhook), avoiding duplicates (e.g. by `orderLineId` + `userId` or similar).

Optional: when an **existing** user logs in, you could also run “claim orders where `guestEmail = user.email`” so that if they had paid as guest with the same email, they see those courses after login. Same `claimGuestOrdersByEmail` logic.

### 4. Order success page (guest)

For orders with `userId = null` and `guestEmail` set:

- Show a message like: “Payment successful. Create an account with **[email]** to access your courses,” with a link to `/auth/register?email=...` (pre-fill email; don’t expose other PII).
- After they register, `claimGuestOrdersByEmail` runs and they see the courses under Account.

Optional: if you run claim on login as well, you could say “Log in with [email] if you already have an account.”

### 5. Stripe Checkout for guests

- No change required: you already don’t send `customer` when there’s no user, so Stripe collects email (and optionally name) on the checkout page.
- Ensure in Stripe Dashboard that the Checkout session is configured to collect email (default for payment mode).

### 6. Cart merge on login (optional but recommended)

When a user logs in:

- If they had a **guest cart** (cart by `sessionId`), merge it into their **user cart** (cart by `userId`) so they don’t lose items.  
- Same idea as “claim orders”: one cart wins (e.g. merge lines into user cart and clear guest cart), so behaviour is consistent and they can checkout as a registered user and get registrations immediately.

---

## Summary

- **Purchase:** Already supports both guests (Cart/Order by `sessionId`) and users (Cart/Order by `userId`). Stripe: no `customer_id` for guests (email collected on checkout); `stripeCustomerId` for users.
- **Attendance:** Always as **Registrations** linked to a **User**. For guests we don’t create registrations until we have a user: either by **auto-claim** in the webhook (guest email matches existing user) or by **claim on register** (new user registers with same email as a guest order).
- **Data:** Add `guestEmail` on Order; use it only for claiming; clear or leave it for audit as you prefer.

This keeps a single, clear model (Registrations = user + course + order line) and resolves how both guests and registered users can purchase and attend courses without conflicting with the existing Stripe or Cart/Order design.
