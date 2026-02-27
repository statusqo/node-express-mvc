# Checkout flow: “Save card for later” — step-by-step

This document traces the checkout flow when a logged-in user pays with a new card and checks “Save this card for later”, and explains where the save can fail.

---

## Step 1: User opens checkout page (GET /checkout)

**Controller:** `checkout.controller.js` → `show(req, res)`

- `getUserIdAndSession(req)` → `userId = req.user?.id`, `sessionId = req.sessionID` (from session cookie).
- Cart and lines are loaded; if user is logged in, `paymentMethods = paymentMethodService.listByUser(userId)`.
- Template is rendered with `user`, `paymentMethods`, `stripePublishableKey`, etc.

**Template:** `checkout.pug`

- Form: `#checkoutForm` with `data-user-logged-in=(user ? '1' : '')`.
- If `paymentMethods.length > 0`: “Use saved card” / “Use new card” radios and `#paySavedCard`, `#payNewCard`, `#savedPaymentMethod` exist.
- If `paymentMethods.length === 0`: those elements are **not rendered** (no “Use saved card” block).
- Always (when Stripe key exists): `#card-element`, `#cardElementWrap`, `.saveCardRow`, `#saveCardCheckbox` (name="saveCard", value="1") are rendered.

So when the user has **no saved cards**, `#paySavedCard` and `#payNewCard` do **not** exist in the DOM.

---

## Step 2: Checkout JS runs (checkout.js init)

**Lines 50–55:**

```javascript
var paySavedCard = document.getElementById("paySavedCard");   // null when no saved cards
var payNewCard = document.getElementById("payNewCard");       // null when no saved cards
var savedCardSelect = document.getElementById("savedCardSelect");
var cardElementWrap = document.getElementById("cardElementWrap");
var saveCardCheckbox = document.getElementById("saveCardCheckbox");  // exists
var saveCardRow = document.querySelector(".saveCardRow");
```

**Lines 57–65:** `updatePaymentUI()`:

- `useSaved = paySavedCard && paySavedCard.checked` → when `paySavedCard` is null, this is **false**.
- So `cardElementWrap` and `saveCardRow` are shown (use new card, show “Save this card” row). Correct.

**Lines 73–81:** Stripe Elements:

- `#card-element` exists, so `cardElement` is created and mounted. Correct.

---

## Step 3: User checks “Save this card for later” and clicks Place order

**Lines 84–86:** Form submit:

- `ev.preventDefault()` — form does not do a normal POST.
- `useSavedCard = paySavedCard && paySavedCard.checked` → **false** (paySavedCard is null).
- So we are in “use new card” path.

**Lines 108–113:** Body for create-payment-intent:

- `bodyForIntent`: only `email=...` (and optionally `paymentMethodId` when using saved card; here we do not).
- So body is e.g. `"email=user@example.com"`.

**Lines 114–119:** `fetch("/checkout/create-payment-intent", { method: "POST", body: bodyForIntent, credentials: "same-origin" })`

- Session cookie is sent (`credentials: "same-origin"`).
- No `paymentMethodId` in body (new card).

---

## Step 4: Server creates PaymentIntent (POST /checkout/create-payment-intent)

**Controller:** `createPaymentIntent(req, res)`

- `getUserIdAndSession(req)` → `userId` from `req.user` (session), `sessionId` from `req.sessionID`.
- If session is present and has `userId`, `req.user` is set by app-level middleware, so **userId is set**.
- No `paymentMethodId` in body → we call `gateway.createPaymentIntentForCart(total, currency, userId, sessionId, options)`.

**Stripe gateway:** `createPaymentIntentForCart(amount, currency, userId, sessionId, options)`

- When `userId` is set: `params.customer = (getOrCreateStripeCustomer(userId, email)).id`, `params.setup_future_usage = "off_session"`.
- So the PaymentIntent is created **with the user’s Stripe customer** and metadata `userId`, `sessionId`.

So if the session was sent, the PaymentIntent is tied to the user’s customer. If the session was **not** sent (e.g. cookie not sent), `userId` would be null and the PaymentIntent would be created **without** a customer — that is one way the later “save card” step can fail (PM not on user’s customer).

---

## Step 5: Client calls Stripe confirmCardPayment

**Lines 124–134:**

```javascript
return stripe.confirmCardPayment(clientSecret, confirmOptions).then(function (result) {
  // result.paymentIntent.id, result.paymentIntent.payment_method
});
```

- `confirmOptions.payment_method = { card: cardElement }` (new card).
- Stripe charges the card and, because the PaymentIntent had a `customer`, attaches the new PaymentMethod to that customer.
- `result.paymentIntent` is the **client-side** object. In Stripe.js, **payment_method** is often **not** included in this object (or only as an id in some versions). So `result.paymentIntent.payment_method` can be **undefined**.

---

## Step 6: Client builds body for complete-order (inside confirmCardPayment .then)

**Lines 135–156:**

```javascript
var paymentIntentId = result.paymentIntent && result.paymentIntent.id;           // e.g. "pi_xxx"
var pm = result.paymentIntent && result.paymentIntent.payment_method;          // often undefined
var paymentMethodIdFromIntent = (typeof pm === "string") ? pm : (pm && pm.id);  // often undefined
var wantToSaveCard = !useSavedCard && saveCardCheckbox && saveCardCheckbox.checked;  // true if box checked
var validPmId = typeof paymentMethodIdFromIntent === "string" && paymentMethodIdFromIntent.indexOf("pm_") === 0;
```

- If Stripe.js does not return `payment_method`, `paymentMethodIdFromIntent` is **undefined**, so **validPmId is false**.

**Body building:**

```javascript
syncSaveCardHidden();  // sync hidden input with checkbox so saveCard=0 or saveCard=1
var bodyParams = new URLSearchParams();
var fields = [..., "saveCard"];  // saveCard is now a form field (hidden input)
// ... append form fields; saveCard comes from hidden input (0 or 1)
bodyParams.append("paymentIntentId", paymentIntentId);
if (validPmId) bodyParams.append("paymentMethodId", paymentMethodIdFromIntent);  // skipped when validPmId is false
```

- **saveCard** is always sent: it comes from the hidden input `#saveCardHidden` (name="saveCard"), which is synced with the checkbox before building the body. So the server always receives `saveCard=0` or `saveCard=1`.
- We **do not** send `paymentMethodId` when `validPmId` is false (client never got `payment_method` from Stripe.js); the server gets it from its own PaymentIntent retrieve with expand.

So the body for complete-order has: form fields + `paymentIntentId` + `saveCard=1`, and **no** `paymentMethodId`.

---

## Step 7: Server runs complete-order (POST /checkout/complete-order)

**Controller:** `completeOrder(req, res)`

- `getUserIdAndSession(req)` → `userId`, `sessionId` (again from session; must be same as create-payment-intent for metadata check).
- `paymentIntentId = req.body.paymentIntentId` — present.
- `validateCheckout(req.body)` — only validates known fields; does not modify `req.body`. So `req.body.saveCard` and `req.body.paymentMethodId` are unchanged.
- `stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["payment_method"] })` — server gets the PaymentIntent **with** `payment_method` expanded (id or full object).
- Metadata check: `(userId && metaUserId !== String(userId)) || (sessionId && metaSessionId !== String(sessionId))` → if this is true, we return 403. So we need the same session (and thus same userId) as when creating the PaymentIntent.
- Order is created and payment recorded.

**Save-card block:**

```javascript
const saveCardRaw = req.body && req.body.saveCard;
const saveCard = (saveCardRaw === "1" || saveCardRaw === true || saveCardRaw === "on" || ...);
const bodyPm = req.body && req.body.paymentMethodId ? String(req.body.paymentMethodId).trim() : "";  // "" when client didn't send it
const pmFromIntent = paymentIntent.payment_method;  // from server retrieve with expand
const pmFromIntentId = typeof pmFromIntent === "string" ? (pmFromIntent || "").trim() : (pmFromIntent && typeof pmFromIntent.id === "string" ? pmFromIntent.id.trim() : null);
let paymentMethodIdToSave = bodyPm.startsWith("pm_") ? bodyPm : (pmFromIntentId && pmFromIntentId.startsWith("pm_") ? pmFromIntentId : null);
```

- If the server’s expanded PaymentIntent has `payment_method` (string id or object with `.id`), **paymentMethodIdToSave** is set from **pmFromIntentId** even when **bodyPm** is empty. So we can have a valid `paymentMethodIdToSave` from the server even when the client didn’t send `paymentMethodId`.
- Condition to save: `userId && saveCard && paymentMethodIdToSave && paymentMethodIdToSave.startsWith("pm_") && gateway`.

So for the save to run we need:

1. **userId** — session must be sent and user authenticated (Passport sets `req.user` from session).
2. **saveCard** — `req.body.saveCard` must be truthy (we send `"1"` when the box is checked).
3. **paymentMethodIdToSave** — from body or from server’s `paymentIntent.payment_method` (expand).

If any of these is missing, we never call `gateway.savePaymentMethod`, so the card never appears under /account.

---

## Where it can break

1. **Session not sent on complete-order**  
   If the session cookie is not sent for the `fetch("/checkout/complete-order", ...)` request, `req.user` is null, so `userId` is null and we never enter the save block. Same if the session expired or was never set.

2. **saveCard not in req.body**  
   If the body we send doesn’t actually contain `saveCard=1` (e.g. wrong key, body not parsed, or we didn’t append it in one code path), then `saveCard` is false and we don’t save.

3. **payment_method missing on server retrieve**  
   If for some reason `stripe.paymentIntents.retrieve(..., { expand: ["payment_method"] })` does not return `payment_method` (or it’s null), then `pmFromIntentId` is null and, if the client didn’t send `paymentMethodId`, `paymentMethodIdToSave` is null, so we don’t save.

4. **gateway.savePaymentMethod throws**  
   If we do call `gateway.savePaymentMethod` but it throws (e.g. Stripe “payment method does not belong to this account”, or our DB/Stripe error), we catch and only log; the order still succeeds but the card is not saved.

The most likely remaining issue is **(1) session not sent** on the complete-order request (so `userId` is null and we never try to save), or **(2) saveCard not actually present in req.body** (e.g. body built incorrectly or not including the checkbox state). Making “save card” a real form field (e.g. hidden input synced with the checkbox and included in the same body we send) ensures the server always sees the user’s choice and avoids losing it in JS logic.
