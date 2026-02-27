# Media Feature — Implementation Plan

This document describes how to add a **Media** model and admin flows so admins can upload media, view/delete it, and attach it to **Products** and **Collections**. Media is shared: one file can be linked to many products/collections; each product/collection can have many media.

---

## 1. Architecture Overview

- **Layer flow**: Routes → Controllers → Services → Repos → Models (unchanged).
- **Admin base path**: Admin is on vhost `admin.*` (e.g. `http://admin.localhost:8080`). Media admin lives at `/media` under that (e.g. `http://admin.localhost:8080/media`).
- **Relations**:
  - **Media** — standalone table (id, path, filename, mimeType, size, alt, timestamps).
  - **Product ↔ Media**: many-to-many via **ProductMedia** (productId, mediaId, sortOrder).
  - **Collection ↔ Media**: many-to-many via **CollectionMedia** (collectionId, mediaId, sortOrder).

---

## 2. Database & Models

### 2.1 Migration

**Implementation**: Media tables were added to the existing single migration `src/db/migrations/20260221100000-create-all-tables.js` (no separate migration file). The `down()` method was updated to drop `collection_media`, `product_media`, and `media` in that order.

**Tables**:

1. **media**
   - `id` (UUID, PK)
   - `path` (STRING, not null) — relative path from upload root, e.g. `uploads/2025/02/uuid-originalname.ext`
   - `filename` (STRING, allowNull) — original filename for display
   - `mimeType` (STRING, allowNull)
   - `size` (INTEGER, allowNull) — bytes
   - `alt` (STRING, allowNull) — alt text for accessibility
   - `createdAt`, `updatedAt`

2. **product_media**
   - `id` (UUID, PK)
   - `productId` (UUID, FK → products.id, CASCADE)
   - `mediaId` (UUID, FK → media.id, CASCADE)
   - `sortOrder` (INTEGER, default 0)
   - `createdAt`, `updatedAt`
   - Unique index on `(productId, mediaId)`
   - Index on `mediaId` for reverse lookups

3. **collection_media**
   - `id` (UUID, PK)
   - `collectionId` (UUID, FK → collections.id, CASCADE)
   - `mediaId` (UUID, FK → media.id, CASCADE)
   - `sortOrder` (INTEGER, default 0)
   - `createdAt`, `updatedAt`
   - Unique index on `(collectionId, mediaId)`
   - Index on `mediaId`

**Down**: Drop `collection_media`, then `product_media`, then `media`.

### 2.2 Models

- **`src/models/Media.js`** — define Media with fields above; `tableName: "media"`.
- **`src/models/ProductMedia.js`** — join model; unique index `["productId", "mediaId"]`.
- **`src/models/CollectionMedia.js`** — join model; unique index `["collectionId", "mediaId"]`.

### 2.3 Associations in `src/models/index.js`

- `Product.belongsToMany(Media, { through: ProductMedia, foreignKey: "productId", otherKey: "mediaId", as: "media" })`
- `Media.belongsToMany(Product, { through: ProductMedia, foreignKey: "mediaId", otherKey: "productId", as: "products" })`
- `Product.hasMany(ProductMedia, { foreignKey: "productId" }); ProductMedia.belongsTo(Product, ...); ProductMedia.belongsTo(Media, ...); Media.hasMany(ProductMedia, { foreignKey: "mediaId" })`
- Same pattern for **Collection** ↔ **Media** via **CollectionMedia**.

---

## 3. Config & File Upload

### 3.1 Config

**File**: `src/config/index.js`

- Add `uploads: { dir: path.join(__dirname, '..', 'uploads'), urlPath: '/uploads' }` (or use `path.join(__dirname, '..', 'public', 'uploads')` if you prefer uploads under public). Ensure `dir` is absolute and points to a folder that will be created on first upload.

### 3.2 Multer

- **Dependency**: Add `multer` in `package.json`.
- **Usage**: Use multer in the route that handles upload (see below). Store files in `config.uploads.dir` with a safe structure (e.g. `YYYY/MM/uuid-originalname` or `YYYY/MM/uuid.ext` to avoid collisions and path traversal). Validate file type/size in middleware or controller (e.g. allow images and common docs, max size 10–20 MB).

### 3.3 Serving uploaded files

- **Option A**: `app.use("/uploads", express.static(path.join(__dirname, "uploads")));` in `src/app.js` (if uploads dir is at `src/uploads` or project root `uploads`). Use the same base path as `config.uploads.urlPath` so stored `path` in DB can be used as URL path (e.g. `path` = `uploads/2025/02/xxx.jpg` → URL `/uploads/2025/02/xxx.jpg`).
- **Option B**: Serve via a controller that checks auth (and optionally ownership) and streams the file — more secure but more code. For admin-only uploads, Option A with upload dir outside public web root is still common; if uploads are under `public`, ensure only your app writes there.

Recommendation: store files in `uploads/` at project root; add `app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));` and ensure `config.uploads.dir` matches. Add `uploads/` to `.gitignore`.

---

## 4. Admin Media Page (`/media`)

### 4.1 Routes

**File**: `src/routes/admin/index.js`

- `GET /media` — list all media (index).
- `POST /media/upload` — multipart form; create file on disk and create Media row; redirect to `GET /media` or return JSON if using AJAX upload later.
- `POST /media/:id/delete` — delete Media by id (remove file from disk if exists, then delete DB row; if media is referenced by products/collections, either block delete or only remove file and leave row with a “deleted” flag — recommend hard delete and remove join rows via FK CASCADE when Media is deleted).

Order: add after Meta Objects and before Blog (or any consistent place).

### 4.2 Controller

**File**: `src/controllers/admin/media.controller.js`

- **index**: Call `mediaService.findAllForAdmin()`; render `admin/media/index` with `media` list.
- **upload**: Use multer in route; in controller get file from `req.file`, validate, save to `config.uploads.dir` with chosen structure, build relative `path`; call `mediaService.create({ path, filename, mimeType, size, alt })`; redirect to `/media` with success flash (or return `{ id, path }` for AJAX).
- **delete**: `mediaService.delete(req.params.id)`; remove file from disk if present; redirect to `/media` with flash.

### 4.3 Service

**File**: `src/services/media.service.js`

- `findAllForAdmin()` — delegate to repo.
- `findById(id)` — delegate to repo.
- `create({ path, filename, mimeType, size, alt })` — delegate to repo; return created Media.
- `delete(id)` — load Media, delete file from disk (using config.uploads.dir + path), then repo delete.

### 4.4 Repo

**File**: `src/repos/media.repo.js`

- `findAll(options)`, `findAllForAdmin(options)`, `findById(id)`, `create(data)`, `destroy(id)`.
- No Product/Collection includes needed for the main media list.

### 4.5 Views

- **`src/views/admin/media/index.pug`**
  - Extend admin layout.
  - Flash message.
  - **Upload form**: `form(action=(adminPrefix)+"/media/upload" method="post" enctype="multipart/form-data")` with `input(type="file" name="file" multiple accept="...")`, optional `input(name="alt")`, submit. Use CSRF if app uses it (layout or include token).
  - **Table**: list media with columns: thumbnail (if image) or icon, filename, mimeType, size, alt; actions: link to view (e.g. open `/uploads/…` in new tab), Delete button (POST to `/media/:id/delete` with confirm).

### 4.6 Sidebar

- **`src/views/fragments/admin/dash-nav.pug`**: In the fallback list (when no `admin-sidebar` menu), add a line: `a(class="dash-link" href=(adminPrefix || '') + "/media") Media`.
- **`src/db/seeders/20260221100003-seed-menus.js`**: Add `{ label: "Media", url: "/media", order: 35 }` to `adminSidebarItems` (between Collections and Meta Objects or similar) so seeded admin sidebar also shows Media.

---

## 5. Linking Media to Products and Collections

### 5.1 Product

- **Repo** (`src/repos/product.repo.js`):
  - Add `syncProductMedia(productId, mediaIds, options)` similar to `syncProductMetaObjects`: set ProductMedia rows by productId and ordered mediaIds; remove join rows for mediaIds no longer in the list.
  - In `findByIdWithFormData` (and any edit include), include `Media` through `ProductMedia` with `through: { attributes: ["id", "productId", "mediaId", "sortOrder"] }`, order by sortOrder.
  - In `create`/`update`, after creating/updating product, call `syncProductMedia(productId, mediaIds, options)`.

- **Service** (`src/services/product.service.js`):
  - `getFormData()`: include list of all media (or recent media) for the picker: e.g. `mediaService.findAllForAdmin()` and pass as `media` (or a dedicated `getMediaForPicker()`).
  - `create(data)`: accept `mediaIds` (array); after product create, call `productRepo.syncProductMedia(product.id, mediaIds || [], options)`.
  - `update(id, data)`: accept `mediaIds`; call `productRepo.syncProductMedia(id, mediaIds || [], options)`.

- **Controller** (`src/controllers/admin/products.controller.js`):
  - In `newForm` and `editForm`, pass `media` (all or picker list) and for edit pass current `product.media` (or `mediaIds` / ordered list).
  - In `create` and `update`, read `req.body.mediaIds` (array), normalize, pass to service.

- **View** (`src/views/admin/products/form.pug`):
  - Add a “Media” section: show existing product media (with thumbnails and sort order); checkboxes or multi-select for “existing media” from the pool (`media`), and optionally an “Upload new” file input that POSTs to `/media/upload` (full-page or AJAX). If AJAX upload is used, append the new media to the list and add its id to a hidden field list (e.g. `mediaIds[]`). On submit, send `mediaIds[]` in order (and optionally `mediaSortOrder[]` or rely on array order).

### 5.2 Collection

- **Repo** (`src/repos/collection.repo.js`):
  - Add `syncCollectionMedia(collectionId, mediaIds, options)` (same pattern as Product).
  - Add `findByIdWithMedia(id)` or extend `findById` with include of Media through CollectionMedia for edit form.

- **Service** (`src/services/collection.service.js`):
  - `getFormData()` or equivalent: ensure edit form can get all media for picker (reuse media service).
  - `create(data)`: accept `mediaIds`; after collection create, call `collectionRepo.syncCollectionMedia(collection.id, mediaIds || [], options)`.
  - `update(id, data)`: accept `mediaIds`; call `collectionRepo.syncCollectionMedia(id, mediaIds || [], options)`.

- **Controller** (`src/controllers/admin/collections.controller.js`):
  - In `newForm` and `editForm`, pass `media` and current collection media (for edit).
  - In `create` and `update`, read `req.body.mediaIds`, normalize, pass to service.

- **View** (`src/views/admin/collections/form.pug`):
  - Add same “Media” section as products: pick from existing pool, optional upload new; submit `mediaIds[]`.

---

## 6. Upload from Product/Collection Page

- **Option A (simplest)**: “Upload new” is a link to `/media` (or a small inline form that POSTs to `POST /media/upload` with `redirect` back to product/collection edit URL via query param). After upload, user returns to edit page and picks the new media from the pool.
- **Option B**: Inline upload on the same page via AJAX: form or drag-drop sends file to `POST /media/upload` that returns JSON `{ id, path, url }`; frontend appends the new item to the “selected media” list and adds its id to `mediaIds[]`. Same multer + media.service.create used; route must accept both redirect (form submit) and JSON response (AJAX) using `Accept` or a query param like `?ajax=1`.

Recommendation: implement Option A first (redirect to `/media` or back to edit with success); add Option B (AJAX upload) as a second step if desired.

---

## 7. Validation & Security

- **File upload**: Validate `mimeType` and size in controller or multer (whitelist image/*, application/pdf, etc.; max size e.g. 10 MB). Use a safe filename (e.g. UUID + original extension, or sanitize extension).
- **Delete media**: Ensure only admins can call delete (admin routes are already behind `requireAuth` and admin check). On delete, remove file from disk and delete Media row; ProductMedia/CollectionMedia rows are removed by FK CASCADE if defined that way.
- **CSRF**: All POST routes (upload, delete) must use app’s CSRF middleware (already applied to non-API routes).

---

## 8. File Checklist (summary)

| Layer        | Action |
|-------------|--------|
| Migration   | Add `src/db/migrations/YYYYMMDDHHMMSS-create-media-tables.js` |
| Models      | Add `Media.js`, `ProductMedia.js`, `CollectionMedia.js`; register and associate in `src/models/index.js` |
| Config      | Add `uploads.dir` and `uploads.urlPath` in `src/config/index.js` |
| Repos       | Add `src/repos/media.repo.js`; extend `product.repo.js` and `collection.repo.js` with sync and media includes |
| Services    | Add `src/services/media.service.js`; extend `product.service.js` and `collection.service.js` for mediaIds and form data |
| Controllers | Add `src/controllers/admin/media.controller.js`; extend products and collections controllers for media |
| Routes      | In `src/routes/admin/index.js` add GET /media, POST /media/upload, POST /media/:id/delete |
| Views       | Add `src/views/admin/media/index.pug`; extend `admin/products/form.pug` and `admin/collections/form.pug` with media section |
| Sidebar     | Update `dash-nav.pug` and `seed-menus.js` for Media link |
| App         | In `src/app.js`: add multer (in route or middleware), serve static `/uploads` from config.uploads.dir, add `uploads/` to .gitignore |
| Package     | Add `multer` dependency |

---

## 9. Implementation Order

1. Migration + models + associations.
2. Config (uploads) + multer + static serving + media repo/service/controller + routes + media index view + sidebar.
3. Product: repo sync + service form data and create/update + controller + form view (media section).
4. Collection: repo sync + service create/update + controller + form view (media section).
5. Optional: AJAX upload endpoint and inline upload on product/collection forms.

Once this plan is approved, implementation can proceed in that order with production-grade code and correct placement in the existing structure.
