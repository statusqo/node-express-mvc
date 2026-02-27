# Views Folder Architecture Proposal

## Summary

This document proposes a **simple, scalable, production-ready** structure for the `src/views` directory. It prioritizes **ease of use**, **ease of maintenance**, and **clear separation of concerns**.

---

## 1. Proposed Folder Structure

```
views/
├── layouts/                      # Layout shells — shared across pages
│   ├── main.pug                 # Main site: document shell, includes nav & footer
│   ├── nav.pug                  # Main site: navbar + cart drawer (nav owns the trigger)
│   ├── footer.pug               # Main site: footer
│   ├── admin.pug                # Admin site: document shell
│   └── dash-nav.pug             # Admin site: sidebar navigation
│
├── pages/                       # Main site (domain.com) — customer-facing
│   ├── home.pug
│   ├── cart.pug
│   ├── checkout.pug
│   ├── contact.pug
│   ├── login.pug
│   ├── register.pug
│   ├── account.pug
│   ├── account/                 # Account sub-pages
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
├── admin/                       # Admin site (admin.domain.com) — back-office
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
└── errors/                      # Error pages (extend main layout)
    ├── error.pug
    └── rate-limit.pug
```

---

## 2. Changes from Current State

| Change | Description |
|--------|-------------|
| **Cart drawer in nav.pug** | Cart drawer markup moved from `main.pug` to `nav.pug` — nav owns the cart trigger, so related UI lives together. |
| **Remove cartable-items** | Dead code — no routes, no controller. Delete `admin/cartable-items/` folder. |
| **Block conventions** | All pages use `block append links`, `block append scripts`, `block append bodyScripts` — never override entire blocks. |
| **No layouts/includes/** | Cart drawer stays in nav.pug; no extra partial unless needed later. |

---

## 3. Block System (Layout → Page)

### Main Layout (`layouts/main.pug`)

| Block | Purpose | Pages use |
|-------|---------|-----------|
| `metas` | Meta tags | `block append metas` |
| `links` | CSS stylesheets | `block append links` |
| `scripts` | All scripts (head) | `block append scripts` |
| `content` | Page body | `block content` |

### Script pattern: DOM-dependent code

All scripts load from the head via `block append scripts`. Scripts that need the DOM wrap their code in `DOMContentLoaded` at the top of the file:

```javascript
document.addEventListener('DOMContentLoaded', function() {
  // DOM-dependent code here
});
```

Or use the readyState check for scripts that may load after DOM is ready:

```javascript
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
```

One place for scripts, clear intention in each file.

### Admin Layout (`layouts/admin.pug`)

Same blocks: `metas`, `links`, `scripts`, `content`. Admin pages use `block append` for page-specific assets.

---

## 4. Page Template Pattern

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

---

## 5. Naming Conventions

| Type | Convention | Example |
|------|-------------|---------|
| Layouts | `main`, `admin`, `nav`, `footer`, `dash-nav` | `main.pug`, `nav.pug` |
| Pages | Route-aligned | `pages/products/show.pug` → `/products/:id` |
| Admin | Resource + action | `admin/products/form.pug` → create/edit |
| Errors | Descriptive | `error.pug`, `rate-limit.pug` |

---

## 6. Scalability

- **New main page**: Add `pages/feature-name.pug` (or `pages/feature/index.pug`, `show.pug`).
- **New admin resource**: Add `admin/resource-name/index.pug` and `form.pug`.
- **New layout block**: Add to layout, pages append as needed.
- **Shared partials**: Create `layouts/partials/` or `layouts/includes/` only when reuse warrants it.

---

## 7. Maintenance Checklist

- [ ] All pages use `block append` for links/scripts — never `block` (override).
- [ ] Page-specific CSS in `/public/css/<page>.css`.
- [ ] Page-specific JS in `/public/js/<page>.js` via `block append scripts`; DOM-dependent code wrapped in `DOMContentLoaded` inside the file.
- [ ] Cart drawer only rendered when `hideCartDrawer` is false (handled in nav.pug).

---

## 8. Implementation Summary (Completed)

- [x] Cart drawer moved from `main.pug` to `nav.pug`
- [x] Main layout: single `block scripts` in head; removed `bodyScripts`
- [x] Admin layout: removed `bodyScripts`; all scripts via `block append scripts`
- [x] All pages: scripts in head via `block append scripts`; DOM-dependent scripts use `DOMContentLoaded` inside the file
- [ ] Remove `admin/cartable-items/` (requires migration to remove sidebar menu item first)
- [ ] Add `specs/` directory and per-view specs (optional; see VIEWS_ARCHITECTURE_PLAN_V2.md)
