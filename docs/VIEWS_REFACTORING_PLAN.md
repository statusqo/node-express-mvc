# Views Directory Refactoring Plan

## Executive Summary

This document outlines a production-grade refactoring of the `/views` directory structure. The primary issues identified are:

1. **Cart drawer in `main.pug`** — The cart drawer (slide-out panel) is embedded in `main.pug` when it belongs in the navigation layer. The nav contains the cart trigger button; the cart drawer is a nav-related UI component.
2. **Layout responsibility blur** — `main.pug` mixes document shell, structural layout, and nav-specific UI (page-overlay, cart-drawer).
3. **Admin layout not self-contained** — Admin layout (`admin.pug`) and sidebar (`dash-nav.pug`) live in the root `layouts/` folder instead of being grouped with admin pages.
4. **No clear separation** — Main site and admin site layouts are intermingled in a single `layouts/` folder.

---

## Current Structure (Problems)

```
views/
├── layouts/                    # Mixed: main site + admin
│   ├── main.pug               # ❌ Contains cart-drawer, page-overlay (nav concerns)
│   ├── nav.pug                # Navbar only; cart trigger here, drawer elsewhere
│   ├── footer.pug
│   ├── admin.pug              # Admin layout — not in admin folder
│   └── dash-nav.pug           # Admin sidebar — not in admin folder
├── pages/                     # Main site pages
│   ├── home.pug
│   ├── cart.pug
│   └── ...
├── admin/                     # Admin pages (but layouts live in layouts/)
│   ├── dashboard.pug
│   ├── products/
│   └── ...
└── errors/
    ├── error.pug
    └── rate-limit.pug
```

**Issues:**
- `main.pug` lines 36–68: Cart drawer markup (overlay + aside) — belongs with nav
- `main.pug` line 35: `page-overlay` — used by nav's mobile menu (`.nav-header.is-open ~ .page-overlay`)
- `nav.pug` has the cart trigger button but not the drawer; `main.pug` has the drawer but the trigger is in nav
- Admin layout and dash-nav are in `layouts/` while admin pages are in `admin/` — inconsistent ownership

---

## Target Structure (Production-Grade)

```
views/
├── layouts/                      # Main site layouts only
│   ├── main.pug                  # Document shell: head, body, nav, content, footer
│   ├── nav.pug                   # Header + page-overlay + cart-drawer
│   ├── includes/
│   │   └── cart-drawer.pug       # Cart drawer partial (included by nav)
│   └── footer.pug
│
├── pages/                        # Main site pages (unchanged)
│   ├── home.pug
│   ├── cart.pug
│   ├── account/
│   ├── products/
│   ├── collections/
│   └── ...
│
├── admin/                        # Admin site: pages + layouts
│   ├── layouts/
│   │   ├── main.pug              # Admin document shell (rename from admin.pug)
│   │   └── dash-nav.pug          # Admin sidebar (moved from layouts/)
│   ├── dashboard.pug
│   ├── products/
│   ├── collections/
│   ├── users/
│   └── ...
│
└── errors/                       # Error pages (extend main site layout)
    ├── error.pug
    └── rate-limit.pug
```

---

## Responsibility Matrix

| Component | Owns | Location |
|-----------|------|----------|
| **main.pug** | Document shell, head, body structure, `include nav`, `block content`, `include footer`, `block bodyScripts` | `layouts/main.pug` |
| **nav.pug** | Header, navbar, page-overlay, cart-drawer (via include) | `layouts/nav.pug` |
| **cart-drawer.pug** | Cart drawer overlay + aside markup | `layouts/includes/cart-drawer.pug` |
| **footer.pug** | Footer navigation | `layouts/footer.pug` |
| **admin/main.pug** | Admin document shell, head, body, sidebar, content | `admin/layouts/main.pug` |
| **admin/dash-nav.pug** | Admin sidebar | `admin/layouts/dash-nav.pug` |

---

## Refactoring Steps

### Phase 1: Extract Cart Drawer to Partial

1. Create `views/layouts/includes/cart-drawer.pug` with the cart drawer markup (overlay + aside).
2. Update `main.pug` to remove the cart drawer markup and delegate to nav.

### Phase 2: Move Nav-Related UI into `nav.pug`

1. Update `nav.pug` to:
   - Wrap content in `header(class="nav-header")` (main.pug currently does this)
   - Add `div(class="page-overlay")` after the header
   - Add `include includes/cart-drawer` after the overlay
2. Update `main.pug` to replace:
   ```pug
   header(class="nav-header")
     include nav
   ...
   div(class="page-overlay")
   ```
   with:
   ```pug
   include nav
   ```
3. Ensure `main.pug` no longer contains cart-drawer or page-overlay markup.

### Phase 3: Create Admin Layout Folder

1. Create `views/admin/layouts/` directory.
2. Create `views/admin/layouts/main.pug` — copy content from `layouts/admin.pug`, update `include dash-nav` to `include layouts/dash-nav` (relative to admin) or `include ./dash-nav` since both are in admin/layouts.
3. Create `views/admin/layouts/dash-nav.pug` — move content from `layouts/dash-nav.pug`.
4. Update admin layout `include` path: `include dash-nav` → `include ./dash-nav` (both in admin/layouts).

### Phase 4: Update Admin Page Extends

Update all admin view files to extend `layouts/main` instead of `../layouts/admin` or `../../layouts/admin`:

| Current | New |
|---------|-----|
| `extends ../layouts/admin` | `extends layouts/main` |
| `extends ../../layouts/admin` | `extends layouts/main` |

Affected files:
- `admin/dashboard.pug`
- `admin/products/index.pug`, `admin/products/form.pug`
- `admin/collections/index.pug`, `admin/collections/form.pug`
- `admin/users/index.pug`, `admin/users/form.pug`
- `admin/meta-objects/index.pug`, `admin/meta-objects/form.pug`
- `admin/product-types/index.pug`, `admin/product-types/form.pug`
- `admin/posts/index.pug`, `admin/posts/form.pug`
- `admin/menus/index.pug`, `admin/menus/form.pug`
- `admin/menu-items/index.pug`, `admin/menu-items/form.pug`
- `admin/cartable-items/index.pug`, `admin/cartable-items/form.pug`

### Phase 5: Remove Legacy Layout Files

1. Delete `views/layouts/admin.pug`.
2. Delete `views/layouts/dash-nav.pug`.

### Phase 6: Verify CSS/JS Loading

- `main.pug` continues to load: `nav.css`, `main.css`, `footer.css`, `cart-drawer.css`, `nav.js`, `main.js`, `footer.js`, `cart-drawer.js`, `add-to-cart.js`
- Cart drawer CSS/JS remain in main layout head — correct (they apply to main site only)
- Admin layout does not load cart-drawer — correct

---

## File Contents (Target State)

### `layouts/main.pug`

```pug
doctype html
html
  head
    title #{title}
    block metas
      meta(charset="utf-8")
      meta(name="viewport" content="width=device-width, initial-scale=1")
      meta(name="author" content="defy.dev")
    block links
      link(rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css")
      link(rel="stylesheet" href="/public/css/nav.css")
      link(rel="stylesheet" href="/public/css/main.css")
      link(rel="stylesheet" href="/public/css/footer.css")
      link(rel="stylesheet" href="/public/css/cart-drawer.css")
    block scripts
      script(src="/public/js/nav.js")
      script(src="/public/js/main.js")
      script(src="/public/js/footer.js")
      script(src="/public/js/cart-drawer.js")
      script(src="/public/js/add-to-cart.js")

  body
    div(class="page")
      div(class="page-body")
        include nav
        main(class="main-content")
          if flash && flash.message
            div(class="flash flash-" + flash.type role="alert" aria-live="polite")= flash.message
          block content
        footer(class="footer")
          include footer
    block bodyScripts
```

### `layouts/nav.pug`

```pug
mixin navItem(link, depth = 0)
  li(class="link-item" + (link.children ? " has-sublinks" : ""))
    a(class="link" href=link.url target=link.target || "_self")
      if link.icon
        i(class="fa-solid " + link.icon aria-hidden="true")
        span(class="link-label visually-hidden")= link.label
      else
        span(class="link-label")= link.label
    if link.children
      div(class="links-panel links-panel-depth-" + (depth + 1))
        div(class="links-panel-body")
          div(class="links-panel-header")
          ul(class="links-list")
            each child in link.children
              +navItem(child, depth + 1)

- const headerMenu = menus && menus.header ? menus.header : []
- const mainNavItems = headerMenu.filter(link => !link.slug || (link.slug !== 'account' && link.slug !== 'cart'))
- const accountItem = headerMenu.find(link => link.slug === 'account')
- const cartItem = headerMenu.find(link => link.slug === 'cart')

header(class="nav-header")
  div(class="navbar")
    div(class="navbar-inner")
      a(class="home-link link" href="/")
        span(class="link-label") Home
      div(class="links-panel nav-main-panel")
        div(class="links-panel-body")
          ul(class="links-list")
            if mainNavItems && mainNavItems.length
              each link in mainNavItems
                +navItem(link)
      div(class="nav-utility")
        if accountItem
          - const accountHref = user ? '/account' : '/auth/login'
          a(class="link nav-utility-link" href=accountHref aria-label=accountItem.label)
            i(class="fa-solid fa-user" aria-hidden="true")
        unless hideCartDrawer
          if cartItem
            button(type="button" class="link nav-utility-link cart-drawer-trigger" aria-label=cartItem.label)
              i(class="fa-solid fa-cart-shopping" aria-hidden="true")
              span(class="cart-count" id="nav-cart-count" style=(cartDrawer && cartDrawer.count > 0 ? "" : "display:none"))= (cartDrawer && cartDrawer.count > 0 ? cartDrawer.count : 0)
          else
            button(type="button" class="link nav-utility-link cart-drawer-trigger" aria-label="Open cart")
              i(class="fa-solid fa-cart-shopping" aria-hidden="true")
              span(class="cart-count" id="nav-cart-count" style=(cartDrawer && cartDrawer.count > 0 ? "" : "display:none"))= (cartDrawer && cartDrawer.count > 0 ? cartDrawer.count : 0)
        button(class="menu-toggle" aria-label="Toggle menu")
          span(class="menu-toggle-icon")
            span(class="menu-toggle-line")
            span(class="menu-toggle-line")
            span(class="menu-toggle-line")

div(class="page-overlay")
include includes/cart-drawer
```

### `layouts/includes/cart-drawer.pug`

```pug
div(class="cart-drawer-overlay" id="cart-drawer-overlay" aria-hidden="true")
aside(class="cart-drawer" id="cart-drawer" role="dialog" aria-label="Cart")
  div(class="cart-drawer-header")
    h2(class="cart-drawer-title") Cart
    button(type="button" class="cart-drawer-close" id="cart-drawer-close" aria-label="Close cart")
      i(class="fa-solid fa-xmark")
  div(class="cart-drawer-body" id="cart-drawer-body")
    if cartDrawer && cartDrawer.lines && cartDrawer.lines.length
      ul(class="cart-drawer-list" id="cart-drawer-list")
        each line in cartDrawer.lines
          - const variant = line.ProductVariant || {}
          - const product = variant.Product || {}
          - const priceRow = variant.ProductPrices && variant.ProductPrices[0]
          - const price = priceRow ? Number(priceRow.amount) : 0
          - const qty = line.quantity || 1
          - const subtotal = price * qty
          - const productVariantId = line.productVariantId || variant.id
          - const title = line.title || (product && product.title) || variant.title || ''
          li(class="cart-drawer-item" data-product-variant-id=productVariantId data-quantity=qty data-price=price)
            span(class="cart-drawer-item-title")= title
            span(class="cart-drawer-item-meta") #{qty} × #{price.toFixed(2)} = #{subtotal.toFixed(2)}
            div(class="cart-drawer-item-actions")
              button(type="button" class="cart-drawer-qty-btn cart-drawer-qty-minus" data-product-variant-id=productVariantId aria-label="Decrease quantity") −
              span(class="cart-drawer-qty" aria-live="polite")= qty
              button(type="button" class="cart-drawer-qty-btn cart-drawer-qty-plus" data-product-variant-id=productVariantId aria-label="Increase quantity") +
              button(type="button" class="cart-drawer-remove-btn" data-product-variant-id=productVariantId aria-label="Remove from cart")
                i(class="fa-solid fa-trash-can")
    else
      p(class="cart-drawer-empty" id="cart-drawer-empty") Your cart is empty.
  div(class="cart-drawer-footer")
    a(href="/cart" class="cart-drawer-link cart-drawer-view") View full cart
    a(href="/checkout" class="cart-drawer-link cart-drawer-checkout" id="cart-drawer-checkout-link" style=(cartDrawer && cartDrawer.lines && cartDrawer.lines.length ? "" : "display:none")) Checkout
```

### `admin/layouts/main.pug`

Content from current `layouts/admin.pug`, with include path:
```pug
include dash-nav
```
(both in `admin/layouts/`, so `dash-nav` resolves to `admin/layouts/dash-nav.pug`)

### `admin/layouts/dash-nav.pug`

Content from current `layouts/dash-nav.pug` — no changes to markup.

---

## Pug Include Path Resolution

- **Main site**: `app.set("views", path.join(__dirname, "views"))` — Pug resolves includes relative to the file being rendered or the views directory.
- **Include from `layouts/main.pug`**: `include nav` → `views/layouts/nav.pug`
- **Include from `layouts/nav.pug`**: `include includes/cart-drawer` → `views/layouts/includes/cart-drawer.pug`
- **Admin**: `admin/dashboard.pug` extends `layouts/main` → Pug looks for `admin/layouts/main.pug` when extends is `layouts/main` and the extending file is in `admin/`. **Correction**: In Pug, `extends` path is relative to the **views directory**. So `extends layouts/main` from `admin/dashboard.pug` would resolve to `views/layouts/main.pug` (main site layout), not admin layout!

We need admin pages to extend the admin layout. Options:
- `extends admin/layouts/main` — resolves to `views/admin/layouts/main.pug` ✓
- Keep `extends ../layouts/admin` and have `layouts/admin.pug` — but we're removing that.

So admin pages should use: `extends admin/layouts/main` (absolute path from views root).

---

## Corrected Admin Extends

| File | Extends |
|------|---------|
| `admin/dashboard.pug` | `admin/layouts/main` |
| `admin/products/index.pug` | `admin/layouts/main` |
| `admin/products/form.pug` | `admin/layouts/main` |
| (all admin/*) | `admin/layouts/main` |

For files in `admin/products/`, the path `admin/layouts/main` works from views root. For files in `admin/`root, same. For files in `admin/products/`, `../layouts/admin` pointed to `layouts/admin`. The new path `admin/layouts/main` is an absolute path from views root — Pug supports that.

---

## Verification Checklist

- [ ] Main site pages render with nav, footer, cart drawer
- [ ] Cart drawer opens/closes; add to cart works
- [ ] Mobile menu overlay works (page-overlay)
- [ ] Admin pages render with sidebar
- [ ] Admin dashboard, CRUD pages all work
- [ ] Error pages (error.pug, rate-limit.pug) render with main layout
- [ ] Checkout page with `hideCartDrawer` does not show cart in nav
- [ ] No broken includes or missing templates

---

## Summary of Changes

| Action | Item |
|--------|------|
| **Create** | `layouts/includes/cart-drawer.pug` |
| **Modify** | `layouts/main.pug` — remove cart-drawer, page-overlay; replace header+include nav with `include nav` |
| **Modify** | `layouts/nav.pug` — add header wrapper, page-overlay, include cart-drawer |
| **Create** | `admin/layouts/main.pug` (from admin.pug) |
| **Create** | `admin/layouts/dash-nav.pug` (from layouts/dash-nav.pug) |
| **Modify** | All admin/*.pug — change extends to `admin/layouts/main` |
| **Delete** | `layouts/admin.pug` |
| **Delete** | `layouts/dash-nav.pug` |
