# Views Refactor Plan — Step by Step

This document outlines the refactor plan **before** any code changes. It addresses:

1. Cart-drawer in nav.pug + nav.css + nav.js (nav included by main, not layout layer)
2. Cart drawer using global page-overlay (no separate cart-drawer-overlay)
3. Explanation of why order, blog, cart, checkout, auth files sit at web root
4. Remove `block bodyScripts` — full encapsulation via `block append links`, `block append scripts`, `block content`

---

## 1. Cart-Drawer in Nav (Included, Not Layout Layer)

### Current State

- `main.pug` contains: cart-drawer markup, cart-drawer-overlay, includes nav, loads nav.css, nav.js, cart-drawer.css, cart-drawer.js.
- `nav.pug` is included by main.pug.

### Target Structure

- **nav.pug**: navbar HTML + cart-drawer aside markup (no overlay). Main includes nav.
- **nav.css**: navbar styles + cart-drawer styles (merge cart-drawer.css into nav.css).
- **nav.js**: navbar logic + cart-drawer logic (merge cart-drawer.js into nav.js).
- **main.pug**: includes nav, loads nav.css, nav.js, add-to-cart.js. No cart-drawer markup, no cart-drawer-overlay. No separate cart-drawer.css or cart-drawer.js.

### Rationale

- Nav is included as a file; cart-drawer lives inside nav.pug.
- Nav and cart-drawer are one component: nav.pug + nav.css + nav.js.
- Remove cart-drawer.css and cart-drawer.js as standalone files.

### Steps

| Step | Action | Details |
|------|--------|---------|
| 1.1 | Merge cart-drawer into nav | Move cart-drawer markup from main.pug into nav.pug. Merge cart-drawer.css into nav.css. Merge cart-drawer.js into nav.js. |
| 1.2 | Strip `main.pug` | Remove cart-drawer markup and cart-drawer-overlay. Remove cart-drawer.css and cart-drawer.js from block links/scripts. Keep `include nav`, nav.css, nav.js, add-to-cart.js. |
| 1.3 | Delete separate files | Remove `public/css/cart-drawer.css` and `public/js/cart-drawer.js`. |

---

## 2. Cart Drawer Uses Global page-overlay

### Current State

- `main.pug` has a global `page-overlay` inside `.page-body`.
- `nav.css` uses `.nav-header.is-open ~ .page-overlay` when the mobile menu is open.
- Cart drawer has its own `cart-drawer-overlay` with `.cart-drawer-overlay.is-open`.
- `cart-drawer.js` uses `cart-drawer-overlay` for open/close.

### Target State

- Remove `cart-drawer-overlay` element entirely.
- Use `page-overlay` for both nav and cart:
  - Nav open: `.nav-header.is-open ~ .page-overlay` (already in nav.css).
  - Cart open: `.page.cart-drawer-open .page-overlay` (add class on `.page`).

### Steps

| Step | Action | Details |
|------|--------|---------|
| 2.1 | Remove cart-drawer-overlay | Not needed after merge — cart-drawer markup moves to nav.pug, overlay removed. |
| 2.2 | Update nav.js (merged cart logic) | Toggle `.cart-drawer-open` on `.page` when opening/closing. Use `page-overlay` for overlay click. |
| 2.3 | Update nav.css (merged cart styles) | Remove `.cart-drawer-overlay` rules. Add `.page.cart-drawer-open .page-overlay { opacity: 1; visibility: visible; }`. |
| 2.4 | Shared overlay close behavior | When `page-overlay` is clicked, close both nav and cart. Add overlay click handler in nav.js. |

---

## 3. Why order, blog, cart, checkout, auth Are at Web Root

### Current Layout

```
web/ (or pages/)
├── home.pug
├── account.pug
├── account/           ← folder
├── blog.pug           ← root
├── blog-post.pug      ← root
├── cart.pug           ← root
├── checkout.pug       ← root
├── contact.pug        ← root
├── login.pug          ← root
├── register.pug       ← root
├── order.pug          ← root
├── orders.pug         ← root
├── collections/       ← folder
└── products/          ← folder
```

### Why They're at Root

- **Simplicity**: One file per route often ends up at root to avoid nesting.
- **Historical**: Added as single-page views without a folder per feature.
- **No convention**: Unlike `collections/`, `products/`, `account/`, there was no rule that "each feature gets a folder."

### Why Folders Exist for Some

- **collections/**, **products/**: Index + show (and possibly more) → folder makes sense.
- **account/**: address-form, addresses → multiple related views → folder.

### Why Root-Level Files Could Be Grouped

For consistency and clearer origin:

| Current | Proposed Grouping | Rationale |
|---------|-------------------|-----------|
| `login.pug`, `register.pug` | `auth/login.pug`, `auth/register.pug` | Auth is a distinct feature. |
| `blog.pug`, `blog-post.pug` | `blog/index.pug`, `blog/show.pug` | Blog is a resource with index and show. |
| `cart.pug`, `checkout.pug` | `shop/cart.pug`, `shop/checkout.pug` | Shopping flow. |
| `order.pug`, `orders.pug` | `orders/show.pug`, `orders/index.pug` | Already "orders" concept; aligns with `collections/`, `products/`. |

### Recommendation

Optional later refactor:

- `auth/login.pug`, `auth/register.pug`
- `blog/index.pug`, `blog/show.pug` (or `blog-post.pug` → `blog/show.pug`)
- `shop/cart.pug`, `shop/checkout.pug`
- `orders/index.pug`, `orders/show.pug`

Keep `home.pug`, `contact.pug`, `account.pug` at root as single entry points.

---

## 4. Remove bodyScripts — Full Encapsulation Pattern

### Rationale

Every view that extends a layout should encapsulate its own functionality via:
- `block append links` — page-specific CSS
- `block append scripts` — page-specific JS
- `block content` — page content

`block bodyScripts` is a leak: it puts scripts in a different place (end of body) instead of via `block append scripts`. The layout should not expose a second block for scripts. All scripts go through `block scripts` / `block append scripts`.

### Current bodyScripts Usage

| File | Uses bodyScripts | Content |
|------|------------------|---------|
| `layouts/main.pug` | Defines `block bodyScripts` | Empty |
| `layouts/admin.pug` | Defines `block bodyScripts` | Empty |
| `pages/checkout.pug` | `block append bodyScripts` | checkout.js |
| `pages/account.pug` | `block append bodyScripts` | addresses-profile.js, account-payment-methods.js |

### Changes Required

| File | Change |
|------|--------|
| `layouts/main.pug` | Remove `block bodyScripts` entirely. |
| `layouts/admin.pug` | Remove `block bodyScripts` entirely. |
| `pages/checkout.pug` | Move `block append bodyScripts` content into `block append scripts`. |
| `pages/account.pug` | Move `block append bodyScripts` content into `block append scripts`. |

### Note on Script Placement

Scripts added via `block append scripts` go in the `<head>` (or wherever the layout's `block scripts` is). If scripts rely on DOM being ready, they should use `DOMContentLoaded`. All checked scripts (checkout.js, account.js, addresses-profile.js, account-payment-methods.js) already use `DOMContentLoaded` or similar, so placing them in head is fine.

### Admin Views Using block scripts (Replace)

These use `block scripts` (replace) instead of `block append scripts`:

| File | Current | Change |
|------|---------|--------|
| `admin/meta-objects/form.pug` | `block scripts` (replaces) | Change to `block append scripts` for consistency. |
| `admin/users/index.pug` | `block scripts` (replaces) | Change to `block append scripts` for consistency. |

---

## 5. Full Step-by-Step Execution Order

### Phase A: Cart-Drawer in Nav

1. **Merge cart-drawer into nav**
   - Add cart-drawer markup to nav.pug.
   - Merge cart-drawer.css into nav.css.
   - Merge cart-drawer.js into nav.js.
   - Use page-overlay, toggle `.page.cart-drawer-open` on `.page`.

2. **Strip main.pug**
   - Remove cart-drawer markup and cart-drawer-overlay.
   - Remove cart-drawer.css and cart-drawer.js from block links/scripts.

3. **Delete files**
   - Remove `public/css/cart-drawer.css` and `public/js/cart-drawer.js`.

4. **nav.js**
   - Add overlay click handler to close nav (and cart when using page-overlay).

### Phase B: Remove bodyScripts

5. **layouts/main.pug**
   - Remove `block bodyScripts`.

6. **layouts/admin.pug**
   - Remove `block bodyScripts`.

7. **pages/checkout.pug**
   - Replace `block append bodyScripts` with `block append scripts` for checkout.js.

8. **pages/account.pug**
   - Replace `block append bodyScripts` with `block append scripts` for addresses-profile.js and account-payment-methods.js.

9. **admin/meta-objects/form.pug**
   - Change `block scripts` to `block append scripts`.

10. **admin/users/index.pug**
    - Change `block scripts` to `block append scripts`.

### Phase C: Optional folder grouping (later)

11. Create `auth/`, `blog/`, `shop/`, `orders/` and move views.
12. Update controller `res.render()` paths.

---

## 6. Files to Touch (Summary)

| File | Changes |
|------|---------|
| `layouts/main.pug` | Remove cart-drawer markup, cart-drawer-overlay, cart-drawer.css, cart-drawer.js; remove `block bodyScripts`. |
| `layouts/nav.pug` | Add cart-drawer aside markup (no overlay). |
| `layouts/admin.pug` | Remove `block bodyScripts`. |
| `public/css/nav.css` | Merge cart-drawer.css; add `.page.cart-drawer-open .page-overlay`. |
| `public/js/nav.js` | Merge cart-drawer.js; use page-overlay; add overlay click for nav. |
| `pages/checkout.pug` | Move bodyScripts content to `block append scripts`. |
| `pages/account.pug` | Move bodyScripts content to `block append scripts`. |
| `admin/meta-objects/form.pug` | Change `block scripts` to `block append scripts`. |
| `admin/users/index.pug` | Change `block scripts` to `block append scripts`. |
| Delete | `public/css/cart-drawer.css`, `public/js/cart-drawer.js` |

---

## 7. Verification Checklist

- [ ] Nav bar appears on all web pages.
- [ ] Cart drawer opens from nav cart button.
- [ ] Cart drawer closes on overlay click and close button.
- [ ] Mobile nav opens and closes; overlay appears.
- [ ] Overlay click closes both nav and cart as appropriate.
- [ ] No `cart-drawer-overlay` in DOM.
- [ ] Nav and cart share the same `page-overlay`.
- [ ] Checkout page loads checkout.js and Stripe works.
- [ ] Account page loads addresses-profile.js and account-payment-methods.js.
- [ ] Admin meta-objects form and users index scripts still work.
- [ ] Admin pages unaffected (still use `layouts/admin`).
