# Prompt: Migrate Admin from Subdomain to domain.com/admin

**Instructions for the Cursor agent:** Follow this prompt in order. Do not skip the discovery phase. Understand the codebase thoroughly before making any code changes. After discovery, produce a short migration plan (bullet list) and then implement. Prefer simplifying the code (remove host-based logic, avoid duplicate mounts) where possible; consider folder/layout simplifications that make sense when admin is on the same origin as web.

---

## Your goal

Migrate the application so that the **admin panel is served at `domain.com/admin`** (path-based) instead of **`admin.domain.com`** (subdomain). All admin URLs should become `https://domain.com/admin`, `https://domain.com/admin/products`, `https://domain.com/admin/media`, etc. The app must work correctly after the change: admin auth, redirects, uploads/thumbnails, and error pages must all behave correctly on the same origin as the main site.

---

## Phase 1: Understand the codebase (do this first)

Before changing any code, you must understand how admin is currently wired.

### 1.1 How admin is mounted today

- Open **`src/app.js`**. Find where the admin router is attached.
- You will see **`vhost("admin.*", adminRouter)`**: the admin app is mounted only when the request host matches `admin.*` (e.g. `admin.localhost`, `admin.domain.com`). Requests to the main host never hit the admin router.
- Confirm: **`src/routes/index.js`** has a commented line that used to mount admin at `/admin`; the main app mounts **web**, **api**, and **auth** routes only.

### 1.2 How admin knows its “prefix”

- Open **`src/routes/admin/index.js`**. The first middleware sets **`req.adminPrefix`** and **`res.locals.adminPrefix`** from **`req.baseUrl`**.
- When the app is behind vhost, the admin router is the *only* router for that host, so **`req.baseUrl`** is typically **`""`** (empty). So today **adminPrefix** is usually empty and admin URLs look like `/products`, `/media`, etc. on the admin host.
- After migration, the admin router will be mounted at **`/admin`**, so **`req.baseUrl`** will be **`"/admin"`** and **adminPrefix** will be **`"/admin"**. All existing links that use **`(adminPrefix || '') + "/something"`** will then become **`/admin/something`** without changing every view or controller.

### 1.3 Where “admin” is detected (host-based)

Search the codebase for:

- **`req.hostname`** or **`req.headers.host`** or **`host.startsWith("admin.")`** or **`isAdminRequest`**
- **`vhost`**
- **`admin.*`**

You will find:

- **`src/middlewares/auth.middleware.js`**: **`isAdminRequest(req)`** returns true when **`req.headers.host.startsWith("admin.")`**. Used to decide “is this an admin request?” for requireAuth (redirect to login with returnTo, and isAdmin check). After migration, “admin request” must be determined by **path** (e.g. **`req.path.startsWith("/admin")`** or **`req.originalUrl.startsWith("/admin")`**), not host.
- **`src/controllers/auth/auth.controller.js`**: After login, redirect logic uses **`returnTo`** and a check for **`host.startsWith("admin.")`** to send the user back to the admin host. After migration, **returnTo** will point to **domain.com/admin/...**; remove the special-case redirect to **`http://` + host + `/`** for admin host.
- **`src/middlewares/error.middleware.js`**: **`isAdminHost`** is true when **`req.hostname.toLowerCase().startsWith("admin.")`**. Used to render the admin error view with admin layout. After migration, detect admin by **path** (e.g. **`req.originalUrl.startsWith("/admin")`**) and set **`res.locals.adminPrefix = "/admin"`** when rendering the admin error view.
- **`src/controllers/admin/media.controller.js`**, **`src/controllers/admin/products.controller.js`**, **`src/controllers/admin/collections.controller.js`**: They build upload/thumbnail URLs. Some have logic like “if admin host, use relative URL so thumbnails load from same origin.” After migration, everything is same-origin; use a single rule (e.g. **`(req.adminPrefix || "") + "/uploads/" + path`** or relative **`/uploads/...`**). **Remove** any branch that checks **`req.hostname.startsWith("admin.")`**.

### 1.4 Uploads and static files

- In **`src/app.js`**, **`/uploads`** is mounted with **`express.static(config.uploads.dir)`** on the **main app**. So **domain.com/uploads/...** is already served.
- In **`src/routes/admin/index.js`**, there is a **second** mount of the same uploads directory on the **admin router** so that when the page is on **admin.domain.com**, **img** requests to **admin.domain.com/uploads/...** are served. After migration, the page will be on **domain.com/admin**, so **/uploads/...** will be requested from **domain.com** and the **main app’s** static mount will serve it. You can **remove** the duplicate **router.use(...uploads...)** from the admin router.

### 1.5 Auth and redirects

- **`requireAuth`** in **`src/middlewares/auth.middleware.js`**:
  - When the user is not logged in and the request is “admin,” it redirects to **`/auth/login?returnTo=`** + full URL (built from **`req.get("host")`** and **`req.originalUrl`**). After migration, build **returnTo** from the same origin (e.g. **`req.protocol`**, **`req.get("host")`**, **`req.originalUrl`**) so it becomes **https://domain.com/admin/...**.
  - **isAdminRequest** must be changed from “host starts with admin.” to “path (or originalUrl) starts with /admin.”
- **Login success** in **`src/controllers/auth/auth.controller.js`**:
  - It uses **returnTo** if present and safe. It also has a branch: if **host.startsWith("admin.")** then redirect to **`http://` + host + `/`**. **Remove** that branch. Rely on **returnTo** (which will now be **domain.com/admin/...**) or default to **/account**.

### 1.6 Views and links

- All admin views use **`(adminPrefix || '') + "/..."`** for links, forms, and redirects. **No view or seeder URL strings need to change** as long as **adminPrefix** is set to **`"/admin"`** when the admin router is mounted at **/admin**. The seeded menu items use URLs like **`/`**, **`/users`**, **`/products`**; **dash-nav.pug** prepends **adminPrefix**, so they will become **/admin**, **/admin/users**, **/admin/products** automatically.

### 1.7 Session and cookies

- In **`src/app.js`**, session **cookie.domain** may be set for production (e.g. **yourdomain.com**) to share the cookie across subdomains. With path-based admin, the same host serves both web and admin, so you do **not** need a shared subdomain cookie. Optionally simplify **cookie.domain** (e.g. leave unset or set to the exact host); document the choice.

---

## Phase 2: Migration plan (write this before coding)

After Phase 1, write a short migration plan (bullet list) that includes:

1. **app.js**: Remove vhost; mount admin at **`/admin`**; remove **vhost** require if unused.
2. **routes/admin/index.js**: Remove the duplicate **uploads** static mount; remove **config** require if only used for that.
3. **auth.middleware.js**: Define “admin request” by path (**req.path** or **req.originalUrl** starts with **/admin**); build **returnTo** for unauthenticated admin requests without assuming admin host.
4. **auth.controller.js**: Remove redirect branch that checks **host.startsWith("admin.")**; keep **returnTo** and default redirect (e.g. **/account**).
5. **error.middleware.js**: Detect admin by path; set **adminPrefix** to **"/admin"** when rendering admin error view.
6. **media.controller.js**, **products.controller.js**, **collections.controller.js**: Remove host-based branching for upload/thumbnail URLs; use one rule (e.g. **adminPrefix + "/uploads/" + path** or relative **/uploads/...**).
7. **routes/index.js**: Update or remove the comment about admin being moved to vhost.
8. **Session cookie**: Optional simplification of **cookie.domain** and a one-line comment.
9. **Folder/layout simplification**: Note any small simplifications (e.g. shared error layout selection by path, or removing a redundant middleware). Do **not** merge **views/admin** and **views/web** or **controllers/admin** and **controllers/web**; keep separation by purpose. Only remove or simplify code that existed purely for subdomain (host checks, duplicate uploads mount).

---

## Phase 3: Implementation

Execute the migration plan in a logical order:

1. **Mount admin at /admin** in **app.js** and remove vhost. Ensure **adminPrefix** is set by the admin router (from **req.baseUrl**); verify one admin route (e.g. **/admin** or **/admin/products**) returns the expected page when visiting **http://localhost:PORT/admin** (or **http://localhost:PORT/admin/products**).
2. **Auth**: Change **isAdminRequest** to path-based; update **returnTo** building and login redirect logic. Test: from **domain.com/admin**, unauthenticated user is redirected to login with **returnTo** pointing to **domain.com/admin/...**, and after login is sent back to admin.
3. **Error handler**: Switch to path-based admin detection and set **adminPrefix** for the admin error view. Test: trigger a 500 on an admin route and confirm the error page uses the admin layout (sidebar, “Back to dashboard” to **/admin**).
4. **Uploads**: Remove the duplicate static mount from the admin router. Ensure media list and product/collection thumbnails still load (same-origin **/uploads/...**). Remove host-based URL logic from media, products, and collections controllers.
5. **Cleanup**: Remove unused **vhost** (and optionally **config** in admin routes), update comments, and optionally simplify **cookie.domain**. Run the app and do a quick smoke test: open **/admin**, **/admin/products**, **/admin/media**, upload a file, edit a product with media, trigger an error on admin.

---

## Phase 4: Folder and structure simplification (optional, conservative)

- **Do not** merge **views/admin** and **views/web**, or **controllers/admin** and **controllers/web**. The split is by purpose (admin vs public), not by host.
- **Do** look for:
  - **Redundant conditionals** that you can remove now that admin is on the same origin (e.g. “if admin host then X else Y” → just “X” or “Y”).
  - **Duplicate logic** (e.g. two places that build upload URLs) and reduce to one.
  - **Layout or error view**: If there is a shared “choose layout by path” pattern, keep it simple (e.g. “if path starts with /admin use admin layout” in one place).
- If you find a clear simplification (e.g. one less middleware or one less branch in a controller), add it to the migration; do not refactor the whole folder tree.

---

## Checklist before you finish

- [ ] Admin is mounted at **`/admin`** in **app.js**; no vhost.
- [ ] **adminPrefix** is **`"/admin"`** for all admin requests (set from **req.baseUrl** in admin router).
- [ ] **isAdminRequest** (or equivalent) uses path (**/admin**), not host.
- [ ] Login **returnTo** and post-login redirect work for **domain.com/admin/...** (no **admin.** host branch).
- [ ] Error page for admin routes uses admin layout and **adminPrefix** **"/admin"**.
- [ ] Uploads are served only from the main app’s **/uploads** mount; admin router no longer mounts uploads.
- [ ] Media, products, and collections controllers build upload/thumbnail URLs without **host.startsWith("admin.")**.
- [ ] All admin links and redirects use **adminPrefix** and therefore point to **/admin/...**.
- [ ] Session cookie domain (if set) is consistent with single-host usage; no required subdomain sharing.
- [ ] No broken references to **vhost** or **admin.*`**; comments updated.
- [ ] Quick manual test: **/admin**, **/admin/products**, **/admin/media**, login from admin, error on admin, thumbnails load.

---

## Out of scope (do not do)

- Do not change the database schema or migrations.
- Do not change the structure of web vs admin **views** or **controllers** (no merging into a single “site” folder).
- Do not add new features; this is a migration from subdomain to path-based admin only.
- Do not change how **requireAuth** or **isAdmin** authorization works beyond how “admin request” is detected (host → path).

---

Use this document as the single source of truth for the migration. Understand the codebase (Phase 1), write the short plan (Phase 2), then implement (Phase 3) and optionally simplify (Phase 4).
