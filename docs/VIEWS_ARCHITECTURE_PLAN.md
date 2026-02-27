# Views Folder Architecture Plan

## Overview

This document defines the target architecture for the `views/` folder to support both origins:

- **domain.com** — Public site (shop, products, cart, checkout, blog, etc.)
- **admin.domain.com** — Admin panel (dashboard, CRUD for users, products, menus, etc.)

---

## Design Principles

1. **Single responsibility** — Each layout component owns one concern. Nav owns nav-related UI (header, overlay, cart drawer).
2. **Consistency** — Both origins follow the same patterns: layout shell + partials + pages.
3. **Cohesion** — Related code lives together. Cart drawer lives with nav (trigger + panel).
4. **No dead code** — Remove unused views and routes.

---

## Current State Summary

| Area | Status |
|------|--------|
| **Main layout** | Cart drawer in `main.pug` (belongs in nav) |
| **Main layout** | Page-overlay in `main.pug` (belongs in nav) |
| **Layouts folder** | Mixed: main + admin layouts together |
| **cartable-items** | Dead: views exist, no routes, no controller |

---

## Target Architecture

### Option A: Shared Layouts Folder (Recommended)

Keep all layout files in `layouts/`. Simple, one place for layout infrastructure.

```
views/
├── layouts/
│   ├── main.pug              # Main site: document shell
│   ├── nav.pug               # Main site: header + page-overlay + cart-drawer
│   ├── footer.pug
│   ├── includes/
│   │   └── cart-drawer.pug   # Partial included by nav
│   ├── admin.pug             # Admin site: document shell
│   └── dash-nav.pug          # Admin site: sidebar
│
├── pages/                    # Main site pages (domain.com)
│   ├── home.pug
│   ├── cart.pug
│   ├── account/
│   ├── products/
│   ├── collections/
│   └── ...
│
├── admin/                    # Admin site pages (admin.domain.com)
│   ├── dashboard.pug
│   ├── products/
│   ├── collections/
│   ├── users/
│   ├── menus/
│   ├── menu-items/
│   ├── meta-objects/
│   ├── product-types/
│   └── posts/
│
└── errors/                   # Error pages (use main layout)
    ├── error.pug
    └── rate-limit.pug
```

---

### Option B: Per-Origin Layout Folders

Admin layouts live with admin pages. Clear ownership per origin.

```
views/
├── layouts/                  # Main site layouts only
│   ├── main.pug
│   ├── nav.pug
│   ├── footer.pug
│   └── includes/
│       └── cart-drawer.pug
│
├── pages/                    # Main site pages
│   └── ...
│
├── admin/                    # Admin site (self-contained)
│   ├── layouts/
│   │   ├── main.pug          # Admin layout (from admin.pug)
│   │   └── dash-nav.pug
│   ├── dashboard.pug
│   └── ...
│
└── errors/
    └── ...
```

**Recommendation:** Option A — simpler, fewer path changes, one layouts folder. Unless you prefer strict origin separation, Option A is sufficient.

---

## Responsibility Matrix

| Component | Origin | Owns |
|-----------|--------|------|
| **main.pug** | Main | Document shell, head, body, `include nav`, `block content`, `include footer`, `block bodyScripts` |
| **nav.pug** | Main | Header, navbar, page-overlay, cart-drawer (via include) |
| **cart-drawer.pug** | Main | Cart drawer overlay + aside markup (partial) |
| **footer.pug** | Main | Footer navigation |
| **admin.pug** | Admin | Document shell, head, body, sidebar, `block content` |
| **dash-nav.pug** | Admin | Admin sidebar navigation |

---

## Implementation Plan

### Phase 1: Extract Cart Drawer (Main Site)

1. Create `layouts/includes/cart-drawer.pug` with overlay + aside markup (currently in `main.pug` lines 37–68).
2. Update `nav.pug` to:
   - Wrap content in `header(class="nav-header")` (move from `main.pug`)
   - Add `div(class="page-overlay")` after header
   - Add `include includes/cart-drawer` after overlay
3. Update `main.pug` to:
   - Replace `header + include nav` and `div.page-overlay` with `include nav`
   - Remove cart-drawer markup entirely

**Result:** Nav owns header, overlay, and cart drawer. Main.pug is a clean shell.

---

### Phase 2: Remove Dead Code (cartable-items)

1. Delete `admin/cartable-items/` folder (index.pug, form.pug).
2. Create migration `remove-cartable-items-from-admin-sidebar.js`:
   - Copy the `down()` logic from `20260204100400-add-cartable-items-to-admin-sidebar.js` into the new migration's `up()` — this removes the menu item from the database.
   - Run the migration so the admin sidebar no longer shows the broken "Cartable Items" link.

**Note:** The `cartable_items` table and older migrations stay. We only remove the views and the menu item.

---

### Phase 3: Layout Paths (If Option B)

Only if you choose Option B:

1. Create `admin/layouts/main.pug` (copy from `layouts/admin.pug`).
2. Create `admin/layouts/dash-nav.pug` (move from `layouts/dash-nav.pug`).
3. Update admin layout: `include dash-nav` (relative to `admin/layouts/`).
4. Update all admin views: `extends admin/layouts/main` (instead of `../layouts/admin` or `../../layouts/admin`).
5. Delete `layouts/admin.pug` and `layouts/dash-nav.pug`.

---

## Extends / Include Paths Reference

### Main Site Pages

| Page location | Extends |
|---------------|---------|
| `pages/home.pug` | `../layouts/main` |
| `pages/products/index.pug` | `../../layouts/main` |
| `pages/account/addresses.pug` | `../../layouts/main` |

### Admin Pages

| Page location | Extends (Option A) | Extends (Option B) |
|---------------|-------------------|-------------------|
| `admin/dashboard.pug` | `../layouts/admin` | `admin/layouts/main` |
| `admin/products/index.pug` | `../../layouts/admin` | `admin/layouts/main` |
| `admin/products/form.pug` | `../../layouts/admin` | `admin/layouts/main` |

### Error Pages

| Page | Extends |
|------|---------|
| `errors/error.pug` | `../layouts/main` |
| `errors/rate-limit.pug` | `../layouts/main` |

---

## Naming Conventions

| Context | Convention |
|---------|------------|
| Layout files | `main.pug`, `admin.pug`, `nav.pug`, `footer.pug`, `dash-nav.pug` |
| Partials | `layouts/includes/*.pug` |
| Main site pages | `pages/<resource>.pug` or `pages/<resource>/<action>.pug` |
| Admin pages | `admin/<resource>/index.pug`, `admin/<resource>/form.pug` |
| Error pages | `errors/<name>.pug` |

---

## Verification Checklist

After implementation:

- [ ] Main site: nav, footer, cart drawer all render
- [ ] Cart drawer opens/closes, add-to-cart works
- [ ] Mobile menu overlay works (page-overlay)
- [ ] Checkout page with `hideCartDrawer` hides cart in nav
- [ ] Admin: all CRUD pages render with sidebar
- [ ] Error pages render with main layout
- [ ] No 404s from removed cartable-items
- [ ] Admin sidebar menu has no broken links

---

## Summary of Changes

| Action | Item |
|--------|------|
| **Create** | `layouts/includes/cart-drawer.pug` |
| **Modify** | `layouts/main.pug` — remove cart-drawer, page-overlay; use `include nav` |
| **Modify** | `layouts/nav.pug` — add header wrapper, page-overlay, include cart-drawer |
| **Delete** | `admin/cartable-items/` (folder) |
| **Optional (Option B)** | Move admin layouts to `admin/layouts/`, update extends paths |

---

## File Count Summary

| Current | After (Option A) |
|---------|------------------|
| layouts: 5 files | layouts: 5 files + 1 partial (includes/cart-drawer) |
| admin: 10 resource folders | admin: 9 resource folders (cartable-items removed) |
