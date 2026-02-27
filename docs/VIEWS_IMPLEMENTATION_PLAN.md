# Views Implementation Plan — Step by Step

**Confirm with user before implementing.**

---

## Phase 1: Cart Drawer — Use Nav Pattern for Overlay

**Principle:** Follow the same pattern as nav: add `is-open` to the element that opens; overlay shows via sibling selector `.element.is-open ~ .page-overlay`. No extra class on `.page`.

### Current state (after previous incorrect changes)

- Cart-drawer is a sibling of `.page` (outside `.page-body`).
- cart-drawer.js adds `cart-drawer-open` to `.page` when opening.
- cart-drawer.css uses `.page.cart-drawer-open .page-overlay`.

### Target state

- Cart-drawer is a **sibling of `.page-overlay`** inside `.page-body`, coming **before** `.page-overlay` in the DOM.
- When cart opens: add `is-open` to `.cart-drawer` only (already used for slide animation).
- Overlay: `.cart-drawer.is-open ~ .page-overlay { opacity: 1; visibility: visible; }` — same pattern as nav.

### Steps

| Step | File | Action |
|------|------|--------|
| 1.1 | `main.pug` | Move `aside.cart-drawer` **inside** `.page-body`, before `div.page-overlay`. DOM order: header, main, footer, aside.cart-drawer, div.page-overlay. |
| 1.2 | `cart-drawer.js` | Remove all `pageEl`, `cart-drawer-open` logic. Keep only `is-open` on the drawer. Use `document.querySelector(".page-overlay")` for overlay click. |
| 1.3 | `cart-drawer.css` | Replace `.page.cart-drawer-open .page-overlay` with `.cart-drawer.is-open ~ .page-overlay { opacity: 1; visibility: visible; }`. |

---

## Phase 2: Cart Drawer in Nav — Merge into nav.pug, nav.css, nav.js

**Principle:** Cart-drawer lives in nav.pug (as a mixin), nav.css, nav.js. No separate cart-drawer files.

### Steps

| Step | File | Action |
|------|------|--------|
| 2.1 | `nav.pug` | Ensure nav is a fragment (no `extends`). Add `mixin cartDrawer()` with the full cart-drawer aside markup (from main.pug). Keep existing navbar content. |
| 2.2 | `main.pug` | Remove cart-drawer markup. Add `include nav` at top (if not already). In `.page-body`, before `div.page-overlay`, add `+cartDrawer()`. Remove cart-drawer.css and cart-drawer.js from block links/scripts. |
| 2.3 | `nav.css` | Append all cart-drawer styles from cart-drawer.css (including `.cart-drawer.is-open ~ .page-overlay`). Remove any `.page.cart-drawer-open` rules. |
| 2.4 | `nav.js` | Append all cart-drawer logic from cart-drawer.js. Ensure overlay click closes both nav and cart (remove `is-open` from nav-header and from cart-drawer). |
| 2.5 | Delete | `public/css/cart-drawer.css`, `public/js/cart-drawer.js`. |

---

## Phase 3: Remove bodyScripts — Full Encapsulation

**Principle:** Every view uses only `block append links`, `block append scripts`, `block content`. No `block bodyScripts`.

### Steps

| Step | File | Action |
|------|------|--------|
| 3.1 | `layouts/main.pug` | Remove `block bodyScripts` entirely. |
| 3.2 | `layouts/admin.pug` | Remove `block bodyScripts` entirely. |
| 3.3 | `pages/checkout.pug` | Move `block append bodyScripts` content into `block append scripts`. |
| 3.4 | `pages/account.pug` | Move `block append bodyScripts` content into `block append scripts`. |
| 3.5 | `admin/meta-objects/form.pug` | Change `block scripts` to `block append scripts`. |
| 3.6 | `admin/users/index.pug` | Change `block scripts` to `block append scripts`. |

---

## Phase 4: Views Directory Restructure

** Target structure:**

```
views/
├── layouts/
│   ├── main.pug
│   └── admin.pug
├── fragments/
│   ├── web/
│   │   ├── nav.pug
│   │   └── footer.pug
│   └── admin/
│       └── dash-nav.pug
├── web/
│   ├── home.pug
│   ├── account.pug
│   ├── account/
│   ├── blog.pug
│   ├── blog-post.pug
│   ├── cart.pug
│   ├── checkout.pug
│   ├── contact.pug
│   ├── login.pug
│   ├── register.pug
│   ├── order.pug
│   ├── orders.pug
│   ├── collections/
│   ├── products/
│   └── errors/
│       ├── error.pug
│       └── rate-limit.pug
└── admin/
    └── (unchanged)
```

### Steps

| Step | Action | Details |
|------|--------|---------|
| 4.1 | Create `fragments/web/` | Move `layouts/nav.pug` → `fragments/web/nav.pug`, `layouts/footer.pug` → `fragments/web/footer.pug`. |
| 4.2 | Create `fragments/admin/` | Move `layouts/dash-nav.pug` → `fragments/admin/dash-nav.pug`. |
| 4.3 | Update `layouts/main.pug` | Change `include nav` → `include ../fragments/web/nav`, `include footer` → `include ../fragments/web/footer`. (Paths relative to layouts/.) |
| 4.4 | Update `layouts/admin.pug` | Change `include dash-nav` → `include ../fragments/admin/dash-nav`. |
| 4.5 | Create `web/` | Move `pages/*` → `web/*`. Move `errors/*` → `web/errors/*`. |
| 4.6 | Delete `pages/` and `errors/` | After move. |
| 4.7 | Update all `extends` in web views | `extends ../layouts/main` → `extends ../layouts/main` (path stays same if layouts stays at views/layouts). `extends ../../layouts/main` → `extends ../../layouts/main` for web subdirs. |
| 4.8 | Update `extends` in error views | `extends ../layouts/main` → `extends ../../layouts/main` (from web/errors/). |
| 4.9 | Update controllers | `res.render("pages/...")` → `res.render("web/...")`. |
| 4.10 | Update middlewares | `res.render("errors/error")` → `res.render("web/errors/error")`, `res.render("errors/rate-limit")` → `res.render("web/errors/rate-limit")`. |

---

## Phase 5: Update Include Paths for fragments

After moving nav to `fragments/web/nav.pug`, the `include` in main.pug must be `include fragments/web/nav`. The cartDrawer mixin lives in nav.pug, so main.pug needs `include fragments/web/nav` at the top to get the mixin, then `+cartDrawer()` in the body.

---

## Execution Order Summary

1. **Phase 1** — Fix overlay pattern (cart-drawer as sibling of page-overlay, use `is-open` only).
2. **Phase 2** — Merge cart-drawer into nav (mixin, nav.css, nav.js); delete cart-drawer files.
3. **Phase 3** — Remove bodyScripts; move to block append scripts.
4. **Phase 4** — Restructure views directory (fragments, web, update paths).

---

## Controllers to Update (Phase 4)

| Controller | Current | New |
|------------|---------|-----|
| web/home.controller.js | pages/home | web/home |
| web/contact.controller.js | pages/contact | web/contact |
| web/cart.controller.js | pages/cart | web/cart |
| web/checkout.controller.js | pages/checkout | web/checkout |
| web/account.controller.js | pages/account | web/account |
| web/addresses.controller.js | pages/account, pages/account/address-form | web/account, web/account/address-form |
| web/orders.controller.js | pages/orders, pages/order | web/orders, web/order |
| web/products.controller.js | pages/products/index, pages/products/show | web/products/index, web/products/show |
| web/collections.controller.js | pages/collections/index, pages/collections/show | web/collections/index, web/collections/show |
| web/blog.controller.js | pages/blog, pages/blog-post, errors/error | web/blog, web/blog-post, web/errors/error |
| auth/auth.controller.js | pages/login, pages/register | web/login, web/register |
| error.middleware.js | errors/error | web/errors/error |
| notFound.middleware.js | errors/error | web/errors/error |
| rateLimit.middleware.js | errors/rate-limit | web/errors/rate-limit |

---

## Verification Checklist

- [ ] Nav bar appears on all web pages.
- [ ] Cart drawer opens from nav cart button.
- [ ] Cart drawer closes on overlay click and close button.
- [ ] Mobile nav opens and closes; overlay appears.
- [ ] Overlay click closes both nav and cart.
- [ ] Nav and cart share the same `page-overlay`; no `cart-drawer-open` on `.page`; only `is-open` on elements.
- [ ] Checkout page loads checkout.js; Stripe works.
- [ ] Account page loads addresses-profile.js and account-payment-methods.js.
- [ ] Admin meta-objects form and users index scripts work.
- [ ] All web routes render correctly with new paths.
- [ ] Error pages render correctly.
- [ ] Admin pages unaffected.
