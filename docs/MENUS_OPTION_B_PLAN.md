# Menus Implementation Plan — Option B (Menu + MenuItem)

All menus will be DB-driven. No hardcoded links in layouts.

---

## Option B: Two-Tier Architecture

### Why Option B?

| Aspect | Option A (Single Table) | Option B (Menu + MenuItem) |
|--------|-------------------------|----------------------------|
| **Menu definition** | Implicit via `location` string | Explicit `Menu` record in DB |
| **Create new menu** | Add new string, hope code uses it | Create Menu in admin, add items |
| **Menu metadata** | None | Name, description, order |
| **Admin UX** | "Which location?" (free text) | Dropdown of existing menus |
| **Future extensibility** | Limited | Per-menu settings, templates, etc. |
| **Data integrity** | Typos possible (`heder`) | FK ensures valid menu |

**Option B** treats menus as first-class entities. You define a menu once (e.g. "Main Navigation", slug `header`), then add items to it. The slug is used in code; the name is for admins.

---

## Data Model

### Menu (container)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| slug | STRING | Unique, used in code (e.g. `header`, `footer`, `admin-sidebar`) |
| name | STRING | Human-readable (e.g. "Main Navigation") |
| description | STRING (nullable) | Optional, for admin context |
| active | BOOLEAN | Default true; false = entire menu hidden |
| order | INTEGER | For admin list ordering |
| createdAt, updatedAt | DATE | Timestamps |

### MenuItem (link within a menu)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| menuId | UUID | FK → Menu |
| label | STRING | Link text (used for aria-label when icon-only) |
| url | STRING | href (or form action when method=POST) |
| order | INTEGER | Sort order within menu |
| active | BOOLEAN | Default true |
| parentId | UUID (nullable) | FK → MenuItem (self), for nested items — **no depth limit** |
| icon | STRING (nullable) | e.g. `fa-user`, `fa-cart-shopping` |
| target | STRING (nullable) | `_self`, `_blank` |
| method | STRING (nullable) | `GET` (default) or `POST` — when POST, view renders as form |
| slug | STRING (nullable) | Reserved identifiers for special behavior: `account`, `cart` |
| cssClass | STRING (nullable) | Optional per-item class |
| createdAt, updatedAt | DATE | Timestamps |

**Relationships:**
- `Menu` hasMany `MenuItem` (foreignKey: menuId)
- `MenuItem` belongsTo `Menu`
- `MenuItem` hasMany `MenuItem` (as children, foreignKey: parentId)
- `MenuItem` belongsTo `MenuItem` (as parent, foreignKey: parentId)

**Validation (model-level):**
- `label`: required, max 255
- `url`: required, max 2048; allow `/path` and `https://...`
- `order`: integer ≥ 0
- `slug`: optional, max 50; if set, reserved values `account`, `cart` trigger special view behavior
- **No max nesting depth** — tree can be arbitrarily deep

---

## Default Menus (seeded)

| slug | name | Used in |
|------|------|---------|
| `header` | Main Navigation | `nav.pug` (main site header) |
| `footer` | Footer Links | `footer.pug` |
| `admin-sidebar` | Admin Sidebar | `dash-nav.pug` (admin layout) |

**Seeder content:**

- **header:** Products, Collections, Blog, Contact (main nav) + Account (`slug: account`, icon `fa-user`) + Cart (`slug: cart`, icon `fa-cart-shopping`) — latter two rendered in nav-utility. No Home.
- **footer:** e.g. Contact, Privacy, Terms (or empty initially).
- **admin-sidebar:** Dashboard, Users, Products, Collections, Meta Objects, Blog (links) + Logout (`method: POST`, url `/auth/logout`, form).

---

## What Becomes DB-Driven

### Currently hardcoded → DB-driven

| Location | Current | After |
|----------|---------|-------|
| **nav.pug** | Home (hardcoded), Products/Collections/Blog/Contact (fallback), Cart/Account (nav-utility) | Home stays hardcoded; rest from `menus.header` |
| **footer.pug** | Empty | From `menus.footer` |
| **dash-nav.pug** | Dashboard, Users, Products, Collections, Meta Objects, Blog, Logout | All from `menus.admin-sidebar` |

### Special cases

- **Home / Logo** — **Separate from menu.** Logo (home link) is a distinct brand element; production sites typically keep it separate. Home link stays hardcoded (or future site settings). Not a MenuItem.
- **Cart** — MenuItem with `slug: 'cart'`, icon `fa-cart-shopping`. View renders as button that opens cart drawer (not a link). Cart count from `cartDrawer`.
- **Account** — MenuItem with `slug: 'account'`, icon `fa-user`, label "Account" (for aria-label). **Icon only** in navbar; no "Login" or "Account" text. One icon regardless of auth. View logic: `href = user ? '/account' : '/auth/login'`.
- **Logout** — MenuItem with `method: 'POST'`, url `/auth/logout`. Logout is an action; **POST is correct** (GET would be insecure: CSRF, prefetch). Current app already uses `router.post("/logout", ...)`. View renders as `<form method="POST" action="..."><button>Logout</button></form>`.

---

## Middleware

**`injectMenus`** (replaces `injectNavLinks`):

1. Fetch all active `Menu` records.
2. For each menu, fetch active `MenuItem`s, build tree.
3. Set `res.locals.menus = { header: [...], footer: [...], 'admin-sidebar': [...] }`.
4. Keys = menu slugs. Missing menus = `[]`.

**Efficiency:** Single query for all menus + single query for all items (filter by menuIds), then group in memory. Or one query per menu. For 3 menus, 3 queries is fine; can optimize later with a batch query.

---

## View Changes

### nav.pug

- **Home link** — Hardcoded (separate from menu). `<a class="home-link" href="/">` with logo/text.
- **Main nav items** — Iterate `menus.header`; exclude items with `slug` in `['account', 'cart']` (those go to nav-utility).
- **Nav-utility** — Items with `slug: 'account'` → icon only, `href = user ? '/account' : '/auth/login'`, `aria-label=link.label`. Items with `slug: 'cart'` → render as button (cart-drawer-trigger) with cart count; respect `hideCartDrawer` (e.g. on checkout page). No "Login" or "Account" text — icon only.

### footer.pug

- Iterate `menus.footer` (flat or nested, depending on template).
- If empty, render nothing or placeholder.

### dash-nav.pug

- Iterate `menus['admin-sidebar']`.
- Items with `method === 'POST'` → render as `<form method="POST" action=url><button type="submit">label</button></form>`.
- Regular items → render as `<a href=url>label</a>`.

---

## Admin CRUD

### Menus

- **List:** All menus with item count.
- **Create:** slug, name, description, active, order.
- **Edit:** Same fields.
- **Delete:** Cascade to menu items (or prevent if items exist; recommend cascade).

### Menu Items

**UX flow:** User first selects which menu to edit (e.g. dropdown, tabs, or sidebar). Once selected, all links for that menu are shown as **separate rows** in a table/list — each link is editable inline or via row actions (edit, delete). Tree structure can be indicated by indentation or parent column.

- **List:** Menu selector at top → table of items (one row per link). Columns: label, url, order, parent, icon, actions. Rows can be indented by depth for hierarchy.
- **Create:** Select menu, label, url, order, parent (dropdown of items in same menu, **unlimited depth**), icon, target, method (GET/POST), slug (optional, reserved: `account`, `cart`), active.
- **Edit:** Same fields (inline or modal).
- **Delete:** Cascade children or prevent.
- **Reorder:** Optional drag-and-drop; for v1, manual `order` field is fine.

---

## Migration Strategy

1. **Create** `menus` and `menu_items` tables.
2. **Seed** default menus: header, footer, admin-sidebar.
3. **Migrate** existing `nav_links` → `menu_items` (assign to header menu).
4. **Update** code to use new models, service, middleware, views.
5. **Add** admin CRUD.
6. **Drop** `nav_links` table (new migration).
7. **Remove** NavLink model, nav.repo, nav.service, nav.middleware (old).

---

## File Changes Summary

| Action | File |
|--------|------|
| **Create** | `src/models/Menu.js` |
| **Create** | `src/models/MenuItem.js` |
| **Create** | `src/db/migrations/YYYYMMDD-create-menus-tables.js` |
| **Create** | `src/db/migrations/YYYYMMDD-migrate-nav-links-to-menu-items.js` |
| **Create** | `src/db/migrations/YYYYMMDD-drop-nav-links.js` |
| **Create** | `src/db/seeders/YYYYMMDD-demo-menus.js` |
| **Create** | `src/repos/menu.repo.js` |
| **Create** | `src/services/menu.service.js` |
| **Create** | `src/middlewares/menu.middleware.js` |
| **Create** | `src/controllers/admin/menus.controller.js` |
| **Create** | `src/controllers/admin/menuItems.controller.js` |
| **Create** | `src/views/admin/menus/index.pug`, `form.pug` |
| **Create** | `src/views/admin/menu-items/index.pug`, `form.pug` |
| **Update** | `src/models/index.js` (add Menu, MenuItem; remove NavLink) |
| **Update** | `src/app.js` (injectMenus instead of injectNavLinks) |
| **Update** | `src/routes/admin/index.js` (menus + menu-items routes) |
| **Update** | `src/views/layouts/nav.pug` |
| **Update** | `src/views/layouts/footer.pug` |
| **Update** | `src/views/layouts/dash-nav.pug` |
| **Delete** | `src/models/NavLink.js` |
| **Delete** | `src/repos/nav.repo.js` |
| **Delete** | `src/services/nav.service.js` |
| **Delete** | `src/middlewares/nav.middleware.js` |

---

## Implementation Order (Todo List)

### Phase 1: Models & migrations
1. Create `Menu` model
2. Create `MenuItem` model
3. Migration: create `menus` and `menu_items` tables
4. Update `models/index.js` (add Menu, MenuItem; keep NavLink for now)
5. Migration: migrate nav_links data to menu_items
6. Migration: drop nav_links
7. Seeder: demo menus + items (header, footer, admin-sidebar)

### Phase 2: Repo & service
1. Create `menu.repo.js` (Menu + MenuItem CRUD)
2. Create `menu.service.js` (getMenuTree, getAllMenusForLayout)

### Phase 3: Middleware
1. Create `menu.middleware.js` (injectMenus)
2. Update `app.js` (replace injectNavLinks with injectMenus)

### Phase 4: Views
1. Update `nav.pug` to use `menus.header`, all DB-driven
2. Update `footer.pug` to use `menus.footer`
3. Update `dash-nav.pug` to use `menus['admin-sidebar']`

### Phase 5: Admin CRUD
1. Create `menus.controller.js` (index, new, create, edit, update, delete)
2. Create `menuItems.controller.js` (index, new, create, edit, update, delete)
3. Create admin views (menus + menu-items)
4. Add routes in `admin/index.js`

### Phase 6: Cleanup
1. Remove NavLink from models/index.js
2. Delete NavLink.js, nav.repo.js, nav.service.js, nav.middleware.js
3. Update/remove old demo-nav-links seeder
4. Verify all references updated

---

## Decisions (Resolved)

| # | Topic | Decision |
|---|-------|----------|
| 1 | **Logout** | POST is correct (current app uses it). Add `method` field to MenuItem: `GET` (default) or `POST`. When `POST`, view renders as form. |
| 2 | **Account / Login** | One icon-only item (`slug: 'account'`). No text in navbar. `href = user ? '/account' : '/auth/login'`. |
| 3 | **Home / Logo** | Separate from menu. Hardcoded home link. Production-grade: logo is a distinct brand element. |
| 4 | **Nesting depth** | **Variable — no hard limit.** User decides. Tree builder supports unlimited depth. Admin UI may show depth for clarity. |
