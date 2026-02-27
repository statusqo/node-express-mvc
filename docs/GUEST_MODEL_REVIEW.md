# Guest Model — Review and Recommendation

## Your idea (summary)

- Introduce a **Guest** model: `session_id` + guest data (e.g. email).
- **Cart** and **Order** reference either **User** or **Guest** (each nullable, one required).
- Encapsulate guest/session data in one place; keep it separate from User; make Cart/Order ownership explicit.

---

## Verdict: **It works well and is worth doing**

A small Guest entity fits the current design and improves clarity without adding real bloat.

---

## Why it works well

1. **Single place for guest data**  
   Session ID and email (and any future guest fields) live on Guest. No more `sessionId` + optional `guestEmail` scattered on Cart/Order. When Stripe gives you the payer email, you update `Guest.email`; no need for `guestEmail` on Order.

2. **Clear ownership**  
   Cart and Order “belong to” either a User or a Guest. You express that with two FKs (e.g. `userId`, `guestId`), one of which must be set. The rule “exactly one of user or guest” is explicit in the schema and in code.

3. **Same lifecycle as today, better structure**  
   You already create carts/orders keyed by session when there’s no user. With Guest, you still create one logical “guest” per session, but that becomes a first-class row: **get-or-create Guest by `sessionId`**, then **get-or-create Cart by `guestId`** (or `userId`). Session handling stays the same; data is just organized around Guest instead of raw `sessionId`.

4. **No real bloat**  
   You already store `sessionId` on Cart and Order. With Guest you store it once per session in `guests` and reference it by `guestId`. You add one small table and optional `email`; you can remove `sessionId` from Cart and Order, so the total amount of data is similar and the model is clearer.

5. **Clean relations**  
   “All orders for this guest” → `Order.where({ guestId })`. “Guest who paid but didn’t register” → Guest with paid orders and no linked User. Claim-on-register: find Guest by email, then attach their orders to the new User. Queries and app logic stay straightforward.

6. **Separation of concerns**  
   User = registered account (auth, profile, Stripe customer, etc.). Guest = anonymous visitor identified by session (and later email from checkout). Cart/Order relate to one or the other. That separation is easy to explain and to enforce in code.

---

## Suggested shape

**Guest**

- `id` (UUID, PK)
- `sessionId` (string, unique) — one Guest per browser session
- `email` (string, nullable) — set when you get it (e.g. from Stripe checkout)
- `createdAt`, `updatedAt`

**Cart**

- `userId` (nullable, FK → users)
- `guestId` (nullable, FK → guests)
- Constraint: exactly one of `userId` or `guestId` is non-null (enforced in app and optionally in DB).

**Order**

- Same idea: `userId` (nullable), `guestId` (nullable), one required.
- You can drop `sessionId` from Cart and Order once everything uses `guestId` (Guest holds `sessionId`).

So: Cart and Order don’t store `sessionId` anymore; they point to User or Guest, and Guest holds session (and email).

---

## Behaviour in code

- **When to create Guest**  
  When you need a “guest” cart or order: e.g. first add-to-cart or first checkout step with no logged-in user. Then: **get or create Guest by `sessionId`** (e.g. `findOrCreate({ where: { sessionId } })`), then get-or-create Cart by `guestId` (or by `userId` if logged in). Same pattern you use today with `sessionId`, but the key is now a Guest row.

- **Checkout / Stripe**  
  Order is created with `guestId` (or `userId`). Stripe checkout runs as today. In the webhook, when you receive the payer email for a guest order, update `Guest.email` for the Guest linked to that order (no need for `guestEmail` on Order).

- **Claim on register**  
  When a user registers (or logs in) with email E: find Guests with `email = E`, then find Orders with `guestId` in those guests and `userId` still null; set `order.userId = newUser`, clear `order.guestId` (or keep for audit), create registrations. Optionally merge guest cart into user cart and then ignore or delete the guest cart.

- **Cart merge on login**  
  User logs in; request has a session. Find Guest by `sessionId`; find Cart by `guestId`. Merge that cart into the user’s cart (by `userId`), then clear or leave the guest cart. All doable with the Guest model.

---

## Migration from current schema

- Add `guests` table (id, sessionId, email, timestamps).
- For existing Cart/Order rows that have `sessionId` and no `userId`: for each distinct `sessionId`, create a Guest with that `sessionId`, then set `guestId` on the corresponding carts/orders.
- Then remove `sessionId` from Cart and Order (or keep it temporarily and drop later).

So the Guest model fits your existing “session-based guest” behaviour and improves structure without changing the high-level flow.

---

## One constraint detail

“Exactly one of User or Guest” is easy to enforce in application code (e.g. in cart/order create/update). In the DB you can:

- Rely on app logic only, or
- Add a check constraint (e.g. `(userId IS NOT NULL AND guestId IS NULL) OR (userId IS NULL AND guestId IS NOT NULL)`), if your DB supports it and you want a hard guarantee.

Either way, the Guest model works; the constraint is just how strict you want the schema to be.

---

## Summary

- **Guest model:** Good idea. Encapsulates session + guest data, keeps User vs guest clear, and gives Cart/Order a single “owner” concept (User or Guest).
- **Cart/Order:** Reference User or Guest (each nullable, one required); drop `sessionId` from Cart/Order in favour of `guestId` once migrated.
- **Lifecycle:** Create Guest when you first need a guest cart/order (by session); store email on Guest when you get it from Stripe; use Guest for “claim on register” and optional cart merge on login.

This design is coherent, keeps concerns separated, and matches your goal of handling guests in the same way as sessions but with a clear, cohesive place for guest data.
