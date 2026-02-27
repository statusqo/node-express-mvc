# Views Folder Architecture Plan (v2)

## Overview

This plan defines the target structure for the `views/` folder to support:

1. **Dual-origin clarity** — domain.com and admin.domain.com with sensible structure
2. **Hot-swappable page files** — Each template declares its inputs so another agent can regenerate it
3. **Scalable layout pattern** — Layouts define blocks (content, links, scripts, metas); pages extend and fill them

---

## 1. Folder & File Structure

### Target Layout

```
views/
├── layouts/                      # All layout shells (main + admin)
│   ├── main.pug                  # Main site: document shell
│   ├── nav.pug                   # Main site: navbar
│   ├── footer.pug
│   ├── admin.pug                 # Admin site: document shell
│   ├── dash-nav.pug              # Admin site: sidebar
│   └── includes/
│       └── cart-drawer.pug       # Cart drawer partial (included by main.pug)
│
├── pages/                        # Main site (domain.com)
│   ├── home.pug
│   ├── cart.pug
│   ├── checkout.pug
│   ├── contact.pug
│   ├── login.pug
│   ├── register.pug
│   ├── account.pug
│   ├── account/
│   │   ├── address-form.pug
│   │   └── addresses.pug
│   ├── orders.pug
│   ├── order.pug
│   ├── blog.pug
│   ├── blog-post.pug
│   ├── products/
│   │   ├── index.pug
│   │   └── show.pug
│   └── collections/
│       ├── index.pug
│       └── show.pug
│
├── admin/                        # Admin site (admin.domain.com)
│   ├── dashboard.pug
│   ├── products/
│   │   ├── index.pug
│   │   └── form.pug
│   ├── collections/
│   │   ├── index.pug
│   │   └── form.pug
│   ├── users/
│   │   ├── index.pug
│   │   └── form.pug
│   ├── menus/
│   │   ├── index.pug
│   │   └── form.pug
│   ├── menu-items/
│   │   ├── index.pug
│   │   └── form.pug
│   ├── meta-objects/
│   │   ├── index.pug
│   │   └── form.pug
│   ├── product-types/
│   │   ├── index.pug
│   │   └── form.pug
│   └── posts/
│       ├── index.pug
│       └── form.pug
│
├── errors/                       # Error pages (extend main layout)
│   ├── error.pug
│   └── rate-limit.pug
│
└── specs/                        # Input contracts for each page (agent-consumable)
    ├── pages/
    │   ├── home.json
    │   ├── products-index.json
    │   ├── products-show.json
    │   └── ...
    └── admin/
        ├── dashboard.json
        ├── products-index.json
        ├── products-form.json
        └── ...
```

### Changes from Current

| Change | Description |
|--------|-------------|
| **Extract cart-drawer** | Move to `layouts/includes/cart-drawer.pug`, include from `main.pug`. (Nav owns the trigger; drawer must be at body level outside `div.page`, so it stays in main layout.) |
| **Keep page-overlay in main.pug** | Generic page-level overlay; stays in main layout |
| **Remove cartable-items** | Dead code — no routes, no controller |
| **Add specs/** | Input contracts for each page template |

---

## 2. Layout Block System (Scalability)

### Main Layout (`layouts/main.pug`)

**Blocks** (in order):

| Block | Purpose | Default |
|-------|---------|---------|
| `metas` | Extra meta tags | charset, viewport, author |
| `links` | CSS stylesheets | nav, main, footer, cart-drawer, font-awesome |
| `scripts` | Head scripts | nav.js, main.js, footer.js, cart-drawer.js, add-to-cart.js |
| `content` | Page body | — (required) |
| `bodyScripts` | Scripts before `</body>` | — |

**Usage** (page example):

```pug
extends ../layouts/main

block append metas
  meta(name="description" content="...")

block append links
  link(rel="stylesheet" href="/public/css/home.css")

block append scripts
  script(src="/public/js/home.js")

block content
  section.hero
    h1 Shop
```

### Admin Layout (`layouts/admin.pug`)

**Blocks** (in order):

| Block | Purpose | Default |
|-------|---------|---------|
| `metas` | Extra meta tags | charset, viewport |
| `links` | CSS stylesheets | main.css, admin.css |
| `scripts` | Head scripts | (empty) |
| `content` | Page body | — (required) |
| `bodyScripts` | Scripts before `</body>` | — |

**Admin globals** (from routes middleware): `adminPrefix`, `adminIsDashboard`, `adminSlug`, `adminBackUrl`

---

## 3. Input Contracts (Hot-Swappable Templates)

Each page template receives data from its controller. To make templates hot-swappable, we document **inputs** in a machine-readable format.

### Spec File Format

Each page has a corresponding spec in `views/specs/`. The spec defines:

- **view**: Path passed to `res.render()` (e.g. `pages/home`)
- **origin**: `main` or `admin`
- **layout**: Layout to extend
- **inputs**: Variables passed by the controller (required + optional)
- **globals**: Variables from middleware (menus, user, flash, cartDrawer, etc.)

### Spec Schema (JSON)

```json
{
  "view": "pages/home",
  "origin": "main",
  "layout": "layouts/main",
  "inputs": {
    "title": { "type": "string", "required": true },
    "user": { "type": "User | null", "required": false, "source": "res.locals" }
  },
  "globals": ["menus", "flash", "cartDrawer", "user", "hideCartDrawer"]
}
```

### Spec File Naming

Mirror the view path:

- `pages/home` → `specs/pages/home.json`
- `pages/products/show` → `specs/pages/products-show.json`
- `admin/products/form` → `specs/admin/products-form.json`

### Inline Spec (Alternative)

Each pug file can also include a comment block at the top:

```pug
//- SPEC
//- view: pages/home
//- inputs: title (string, required), user (User|null, optional)
//- globals: menus, flash, cartDrawer
//- END SPEC

extends ../layouts/main
block content
  ...
```

**Recommendation**: Use both — inline comment for quick reference, `specs/` JSON for agent consumption and validation.

---

## 4. Spec Registry (All Views)

A single manifest file `views/specs/REGISTRY.json` lists all views and their spec paths:

```json
{
  "main": [
    "pages/home",
    "pages/cart",
    "pages/checkout",
    "pages/products/index",
    "pages/products/show",
    "pages/collections/index",
    "pages/collections/show",
    "pages/blog",
    "pages/blog-post",
    "pages/account",
    "pages/account/address-form",
    "pages/account/addresses",
    "pages/orders",
    "pages/order",
    "pages/contact",
    "pages/login",
    "pages/register"
  ],
  "admin": [
    "admin/dashboard",
    "admin/products/index",
    "admin/products/form",
    "admin/collections/index",
    "admin/collections/form",
    "admin/users/index",
    "admin/users/form",
    "admin/menus/index",
    "admin/menus/form",
    "admin/menu-items/index",
    "admin/menu-items/form",
    "admin/meta-objects/index",
    "admin/meta-objects/form",
    "admin/product-types/index",
    "admin/product-types/form",
    "admin/posts/index",
    "admin/posts/form"
  ],
  "errors": [
    "errors/error",
    "errors/rate-limit"
  ]
}
```

---

## 5. Global Variables (All Templates)

These are injected by middleware or app-level logic. Document them once.

| Variable | Source | Origin | Description |
|----------|--------|--------|-------------|
| `menus` | menu.middleware | main | `{ header, footer, admin-sidebar }` |
| `user` | app.js (session) | main, admin | Current user or null |
| `flash` | flash.middleware | main, admin | `{ message, type }` |
| `cartDrawer` | cartDrawer.middleware | main | `{ lines, count }` |
| `hideCartDrawer` | checkout.controller | main | true on checkout page |
| `adminPrefix` | admin routes | admin | e.g. `""` for admin.localhost |
| `adminIsDashboard` | admin routes | admin | boolean |
| `adminSlug` | admin routes | admin | e.g. "home/Products" |
| `adminBackUrl` | admin routes | admin | Back link URL |

---

## 6. Input Specs by View (Draft)

### Main Site

| View | Inputs | Notes |
|------|--------|-------|
| `pages/home` | title, user? | |
| `pages/cart` | title, lines, ... | From cart.controller |
| `pages/checkout` | title, lines, checkoutTotal, checkoutCurrency, stripePublishableKey, requiresAddress, user?, deliveryAddress?, billingAddress?, paymentMethods?, sameAsDelivery | |
| `pages/products/index` | title, products | |
| `pages/products/show` | title, product, productVariantId?, price?, currency? | |
| `pages/collections/index` | title, collections | |
| `pages/collections/show` | title, collection, products? | |
| `pages/blog` | title, posts | |
| `pages/blog-post` | title, post | |
| `pages/account` | title, user, addresses?, ... | |
| `pages/account/address-form` | title, address?, isEdit | |
| `pages/account/addresses` | title, addresses | |
| `pages/orders` | title, orders | |
| `pages/order` | title, order | |
| `pages/contact` | title | |
| `pages/login` | title?, error? | |
| `pages/register` | title?, error? | |

### Admin Site

| View | Inputs | Notes |
|------|--------|-------|
| `admin/dashboard` | title, stats, user | |
| `admin/products/index` | title, products | |
| `admin/products/form` | title, product?, productTypes, productCategories, metaObjects, isEdit, error? | |
| `admin/collections/index` | title, collections | |
| `admin/collections/form` | title, collection?, isEdit, error? | |
| `admin/users/index` | title, users | |
| `admin/users/form` | title, user?, isEdit, error? | |
| `admin/menus/index` | title, menusList | |
| `admin/menus/form` | title, menu?, isEdit, error? | |
| `admin/menu-items/index` | title, menuItems, menu? | |
| `admin/menu-items/form` | title, menuItem?, menus, parentItems?, isEdit, error? | |
| `admin/meta-objects/index` | title, metaObjects | |
| `admin/meta-objects/form` | title, metaObject?, isEdit, error? | |
| `admin/product-types/index` | title, productTypes | |
| `admin/product-types/form` | title, productType?, isEdit, error? | |
| `admin/posts/index` | title, posts | |
| `admin/posts/form` | title, post?, isEdit, error? | |

### Errors

| View | Inputs | Notes |
|------|--------|-------|
| `errors/error` | status, title, message, detail?, stack? | From error handler |
| `errors/rate-limit` | title?, message? | |

---

## 7. Implementation Phases

### Phase 1: Layout Refactor

1. Create `layouts/includes/cart-drawer.pug` with cart-drawer markup.
2. Update `main.pug`: replace inline cart-drawer markup with `include includes/cart-drawer`.
3. **Keep** page-overlay in main.pug (no change).

### Phase 2: Dead Code Removal

1. Delete `admin/cartable-items/` folder.
2. Create migration to remove cartable-items menu item from admin sidebar.

### Phase 3: Specs Directory

1. Create `views/specs/` directory.
2. Create `views/specs/REGISTRY.json` with all view paths.
3. Create `views/specs/GLOBALS.md` documenting middleware-injected variables.
4. Create one spec file per page (start with high-traffic pages, then expand).

### Phase 4: Inline Spec Comments (Optional)

Add `//- SPEC` block to each pug file for quick reference. Can be done incrementally.

---

## 8. Agent Instructions (For Regenerating Templates)

When another agent needs to regenerate a pug file:

1. **Read** `views/specs/<view-path>.json` (e.g. `specs/pages/products-show.json`).
2. **Read** `views/specs/GLOBALS.md` for variables available to all templates.
3. **Read** the layout file to understand available blocks (main.pug or admin.pug).
4. **Generate** the new pug file that:
   - Extends the correct layout
   - Uses only the documented inputs and globals
   - Fills the appropriate blocks (content, append links, append scripts, etc.)
   - Preserves the spec block at the top for future agents.

---

## 9. Summary of Changes

| Item | Action |
|------|--------|
| `layouts/includes/cart-drawer.pug` | Create |
| `layouts/main.pug` | Include cart-drawer partial; remove inline markup; keep page-overlay |
| `admin/cartable-items/` | Delete |
| Migration | Add migration to remove cartable-items menu item |
| `views/specs/` | Create directory + REGISTRY.json + GLOBALS.md + per-view specs |
| Page files | Optionally add inline `//- SPEC` comments |
