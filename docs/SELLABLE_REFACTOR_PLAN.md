# Sellable / SellableVariant Refactor — Implementation Plan

**Status:** Planning (no code changes yet)  
**Architectural North Star:** *"Sellable is the thing. Variant is the offer. Collection is the list. Cart only knows offers."*

---

## Executive Summary

This refactor unifies the e-commerce domain under a single **Sellable** / **SellableVariant** model. It eliminates the current split between Product/Service and the polymorphic CartableItem, replacing them with a consistent abstraction that supports physical products, digital products, services, webinars, courses, and future types—all without separate tables per type.

---

## 1. Current State Analysis

### 1.1 Domain Model (As-Is)

| Entity | Purpose | Cart/Order Reference |
|--------|---------|----------------------|
| **Product** | Physical/digital products | Via ProductVariant → CartableItem |
| **ProductVariant** | Size/color/etc.; has ProductPrice | CartableItem.referenceId (type=product_variant) |
| **ProductPrice** | Price per variant | — |
| **Service** | Services (no variants) | CartableItem.referenceId (type=service) |
| **CartableItem** | Polymorphic: type + referenceId → ProductVariant or Service | CartLine.cartableItemId |
| **Collection** | Groups Products | ProductCollection (productId, collectionId) |
| **ProductCategory** | Product taxonomy | — |
| **ProductType** | Product type enum | — |

### 1.2 Key Touchpoints

- **Cart:** `cart.repo.js`, `cart.service.js` — add/remove by `cartableItemId`
- **Order:** `order.service.js`, `order.repo.js` — `createOrderFromCart` uses `cartableItemService.getOrderLineSnapshot`
- **OrderLine:** `productVariantId` (legacy), `cartableItemId`, `cartableType`, `cartableReferenceId`
- **Product creation:** `product.repo.create` — creates Product + ProductVariant + ProductPrice + CartableItem
- **Service:** No variant; price lives in CartableItem (created manually in admin)
- **Collections:** `collection.repo.getProducts` — fetches Products via ProductCollection
- **Routes:** `/products`, `/services`, `/collections` — separate paths
- **Menu:** MenuItem.url stores paths like `/products`, `/collections`, `/services`

### 1.3 Gaps vs. Target

1. **Product vs Service split** — Two separate models; Services have no variants.
2. **CartableItem polymorphism** — type + referenceId is fragile; adding course/webinar requires new types and resolvers.
3. **Collections only reference Products** — Cannot list Services, webinars, courses in collections.
4. **No clean URLs** — `/collections/webinars` works, but `/webinars` does not.
5. **Price location inconsistency** — Product: ProductPrice on variant; Service: price in CartableItem.

---

## 2. Target Domain Model

### 2.1 New Entities

| Entity | Purpose | Replaces |
|--------|---------|----------|
| **Sellable** | One concrete purchasable item (product, webinar, course, service) | Product, Service |
| **SellableVariant** | Commercial offer: price, isCartable, fulfillment type | CartableItem, ProductVariant+ProductPrice (conceptually) |
| **SellableCategory** | Taxonomy (e.g. webinar, course, product) | ProductCategory |
| **SellableKind** | Type enum (physical, digital, service, etc.) | ProductType |
| **SellableCollection** | Join: Collection ↔ Sellable | ProductCollection |

### 2.2 Relationships

```
Sellable
  ├── sellableCategoryId → SellableCategory
  ├── sellableKindId → SellableKind (optional)
  ├── hasMany SellableVariant
  └── belongsToMany Collection (through SellableCollection)

SellableVariant
  ├── sellableId → Sellable
  ├── price, currency (on variant)
  ├── isCartable, active
  └── fulfillmentType (physical, digital, service, access, etc.)

CartLine
  └── sellableVariantId → SellableVariant (replaces cartableItemId)

OrderLine
  └── sellableVariantId → SellableVariant (replaces cartableItemId, productVariantId, cartableItemId)
```

### 2.3 Design Decisions

| Decision | Rationale |
|----------|------------|
| **Price on SellableVariant** | Each offer has its own price; free vs paid is a variant choice. |
| **Sellable may have 0 variants** | Free/public access items (e.g. free webinar) — no cart, direct access. |
| **Single Sellable table** | No separate Webinar, Course, Service tables; `sellableCategoryId` distinguishes. |
| **Collection → Sellable** | Collections list Sellables; one listing page for /webinars, /courses, etc. |
| **Cart/Order reference SellableVariant only** | Clean: cart = list of offers. |

---

## 3. Implementation Phases

### Phase 1: Schema & Migrations (Reversible)

**Goal:** Introduce new tables without breaking existing functionality.

#### 1.1 Create SellableCategory (rename ProductCategory)

- **Migration:** Create `sellable_categories` table (copy structure from `product_categories`).
- **Data migration:** Copy `product_categories` → `sellable_categories`.
- **New model:** `SellableCategory.js`.
- **Keep:** `ProductCategory` for now; add deprecation comment.

#### 1.2 Create SellableKind (rename ProductType)

- **Migration:** Create `sellable_kinds` table (copy from `product_types`).
- **Data migration:** Copy `product_types` → `sellable_kinds`.
- **New model:** `SellableKind.js`.
- **Seed:** Ensure kinds: `physical`, `digital`, `service`, `webinar`, `course`, etc.

#### 1.3 Create Sellable

- **Migration:** Create `sellables` table:
  - `id`, `title`, `slug` (unique), `description`, `sellableCategoryId`, `sellableKindId`, `active`, `createdAt`, `updatedAt`
- **Model:** `Sellable.js`.

#### 1.4 Create SellableVariant

- **Migration:** Create `sellable_variants` table:
  - `id`, `sellableId`, `title` (default "Default"), `sku`, `isDefault`, `active`
  - `price` (DECIMAL), `currency` (default USD)
  - `isCartable` (default true), `fulfillmentType` (e.g. physical, digital, service, access)
  - `createdAt`, `updatedAt`
- **Model:** `SellableVariant.js`.
- **Indexes:** `sellableId`, `(sellableId, isDefault)`.

#### 1.5 Create SellableCollection (replace ProductCollection)

- **Migration:** Create `sellable_collections` table:
  - `id`, `sellableId`, `collectionId`, `sortOrder`
  - Unique on `(sellableId, collectionId)`
- **Do NOT drop** `product_collections` yet.

#### 1.6 Add sellableVariantId to CartLine and OrderLine

- **Migration:** Add `sellableVariantId` (nullable) to `cart_lines` and `order_lines`.
- **Keep** `cartableItemId` for backward compatibility during transition.

---

### Phase 2: Data Migration

**Goal:** Migrate Product and Service data into Sellable/SellableVariant.

#### 2.1 Migrate Products → Sellables

- **Migration script:**
  1. For each Product: create Sellable (title, slug, description, sellableCategoryId from productCategoryId, sellableKindId from productTypeId, active).
  2. For each ProductVariant: create SellableVariant (sellableId from new Sellable, title, sku, isDefault, active, price from ProductPrice, currency, isCartable from CartableItem).
  3. Build mapping: `productVariantId` → `sellableVariantId`, `productId` → `sellableId`.

#### 2.2 Migrate Services → Sellables

- For each Service: create Sellable (sellableCategoryId = "service" category, title, slug, description, active).
- Create one SellableVariant per Service (price from CartableItem, or 0 if none).

#### 2.3 Migrate ProductCollection → SellableCollection

- For each ProductCollection: create SellableCollection (sellableId from product→sellable mapping, collectionId, sortOrder).

#### 2.4 Migrate Cart Lines

- For each CartLine with cartableItemId:
  - Resolve CartableItem → type + referenceId.
  - If product_variant: map referenceId (productVariantId) → sellableVariantId.
  - If service: map referenceId (serviceId) → sellableVariantId (from Service→Sellable→SellableVariant).
  - Update CartLine: set sellableVariantId, optionally null out cartableItemId after verification.

#### 2.5 Migrate Order Lines

- For each OrderLine with cartableItemId or productVariantId:
  - Map to sellableVariantId using same logic.
  - Set OrderLine.sellableVariantId, keep legacy fields for audit.

---

### Phase 3: Model & Association Updates

#### 3.1 Update `models/index.js`

- Add Sellable, SellableVariant, SellableCategory, SellableKind, SellableCollection.
- Associate: Sellable ↔ SellableCategory, SellableKind; Sellable hasMany SellableVariant.
- Associate: Collection belongsToMany Sellable (through SellableCollection).
- Associate: CartLine belongsTo SellableVariant; SellableVariant hasMany CartLine.
- Associate: OrderLine belongsTo SellableVariant.
- Keep Product, Service, CartableItem, ProductCollection for read-only/backward compat during transition.

#### 3.2 Deprecation Path

- Mark Product, Service, CartableItem, ProductCollection as deprecated.
- New code uses Sellable/SellableVariant only.

---

### Phase 4: Repo & Service Layer

#### 4.1 New Repos

- `sellable.repo.js` — CRUD, findBySlug, findActiveBySlug, getVariants.
- `sellableVariant.repo.js` — CRUD, findBySellable, getCartableVariants.
- `sellableCategory.repo.js` — findAll, findById, findBySlug.
- `sellableKind.repo.js` — findAll, findById, findBySlug.

#### 4.2 Update collection.repo.js

- `getSellables(collectionId)` — replace `getProducts`; fetch Sellables via SellableCollection.
- Keep `getProducts` as deprecated wrapper that maps Sellables back to product-like shape if needed during transition.

#### 4.3 Update cart.repo.js

- `addLine(cartId, sellableVariantId, quantity)` — replace cartableItemId with sellableVariantId.
- `removeLine`, `setLineQuantity`, `getLines` — use sellableVariantId.
- `defaultLineInclude` — include SellableVariant (and Sellable for display).

#### 4.4 Update cart.service.js

- `addToCart(userId, sessionId, sellableVariantId, quantity)`.
- Validate SellableVariant exists, is active, isCartable.

#### 4.5 Update cartableItem.service.js → sellableVariant.service.js

- `getCartableVariantForCart(sellableVariantId)` — validate variant.
- `getOrderLineSnapshot(sellableVariantId)` — return title, price, currency, sellableVariantId.

#### 4.6 Update order.service.js & order.repo.js

- `createOrderFromCart` — use sellableVariantId from cart lines.
- `createLineFromCartable` → `createLineFromVariant` — write sellableVariantId to OrderLine.
- OrderLine: prefer sellableVariantId; keep cartableItemId/productVariantId for legacy reads.

---

### Phase 5: Controllers & Routes

#### 5.1 Unified Sellable Detail Route

- **New route:** `GET /sellables/:slug` — detail page for any Sellable (product, service, webinar, etc.).
- **Controller:** Resolve by slug → Sellable with variants; render appropriate template based on sellableCategory.

#### 5.2 Collection Listing (Sellables)

- **Update** `collections.controller.show` — use `collectionRepo.getSellables(collectionId)`.
- **View:** Render list of Sellables (not Products); each has default variant, price, add-to-cart if variant isCartable.

#### 5.3 Clean URL Routing

- **Rule:** `/:slug` resolves to collection page if slug matches a Collection slug.
- **Implementation:**
  1. Add middleware or route: `GET /:slug` (catch-all for non-reserved paths).
  2. Reserved paths: `/`, `/account`, `/cart`, `/checkout`, `/orders`, `/blog`, `/contact`, `/auth/*`, `/api/*`, `/products`, `/services`, `/collections`.
  3. For `/:slug`: query Collection by slug; if found, render collection page; else 404.
  4. Mount `/collections` routes first; then add `/:slug` with lower priority or explicit check.

- **Route order in `web/index.js`:**
  ```
  / (home)
  /account, /cart, /checkout, /orders
  /products, /services (keep for backward compat or redirect)
  /collections (index + /collections/:slug)
  /blog, /contact
  /:slug (collection slug resolver — must be last)
  ```

#### 5.4 Menu Updates

- MenuItem.url can be `/webinars` (collection slug) or `/collections/webinars`.
- Admin: when creating MenuItem, allow "Collection" link type: select Collection, URL = `/{collection.slug}` or `/collections/{collection.slug}`.
- No code change to menu rendering; URLs are stored as-is.

---

### Phase 6: Admin Layer

#### 6.1 Sellable Admin (replaces Products + Services)

- **CRUD:** `/admin/sellables` — create/edit Sellable.
- **Form:** title, slug, description, sellableCategoryId, sellableKindId, active.
- **Variants sub-form:** For each Sellable, manage SellableVariants (title, price, currency, isCartable, fulfillmentType).

#### 6.2 Creation Logic

- **Create Product (legacy)** → Create Sellable (category=product) + SellableVariant (price from form).
- **Create Webinar** → Create Sellable (category=webinar) + SellableVariant (free or paid).
- **Create Service** → Create Sellable (category=service) + SellableVariant.

#### 6.3 Collection Admin

- **Update** collection form: when adding items to collection, select Sellables (not Products).
- **Join table:** SellableCollection.

#### 6.4 Deprecate

- `/admin/cartable-items` — redirect to sellables or hide.
- `/admin/products` — migrate to sellables or keep as "Products" view filtered by category.
- `/admin/services` — same.

---

### Phase 7: Views & Frontend

#### 7.1 Sellable Detail Template

- **New:** `pages/sellables/show.pug` — generic template for any Sellable.
- **Logic:** Show title, description, variants (price, add-to-cart), meta objects.
- **Reuse:** Product meta objects → SellableMetaObject (future) or keep ProductMetaObject linked to Sellable during transition.

#### 7.2 Collection Show

- **Update** `collections/show.pug` — iterate `sellables` instead of `products`.
- **Each item:** title, price from default variant, add-to-cart (sellableVariantId).

#### 7.3 Cart & Checkout

- **Cart drawer / cart page:** Display lines with SellableVariant (include Sellable for title/slug).
- **Checkout:** No change to flow; backend uses sellableVariantId.

#### 7.4 API Cart

- **Update** `api/cart.controller` — accept `sellableVariantId` instead of `cartableItemId`.
- **Update** cart add/update/remove payloads.

---

### Phase 8: Cleanup & Deprecation

#### 8.1 Remove Legacy References

- Remove CartableItem from cart flow (after migration verified).
- Remove productVariantId, cartableItemId from OrderLine (keep for historical orders; new orders use sellableVariantId only).
- Drop `cartable_items` table (after data migrated and no references).
- Drop `product_collections` (after SellableCollection populated).
- Optionally drop Product, Service, ProductVariant, ProductPrice (only if fully migrated; consider keeping for audit).

#### 8.2 Redirects

- `/products/:slug` → `/sellables/:slug` (301) if Product slug exists in Sellable.
- `/services/:slug` → `/sellables/:slug` (301).

---

## 4. Migration Reversibility

- **Phase 1:** All new tables; no drops. Down migrations: drop new tables.
- **Phase 2:** Data copy; original tables unchanged. Down: delete from new tables.
- **Phase 3–7:** Code changes; can revert via git.
- **Phase 8:** Drops are one-way; recommend backup before.

---

## 5. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Data loss during migration | Run migrations in transaction; verify counts before commit. |
| Cart/order breakage | Dual-write during transition; feature flag for new vs old. |
| URL conflicts | Reserved paths checked before collection slug. |
| Menu links break | Menu URLs updated via migration or manual admin. |
| SEO impact | 301 redirects from old URLs. |

---

## 6. Testing Checklist

- [ ] Create Sellable (product-like) → add to cart → checkout → order created.
- [ ] Create Sellable (service) → add to cart → checkout.
- [ ] Collection with mixed Sellables (product + service) displays correctly.
- [ ] `/webinars` (collection slug) renders collection page.
- [ ] `/collections/webinars` also works.
- [ ] Menu item with url `/webinars` works.
- [ ] Cart drawer shows correct items.
- [ ] Order history displays correctly.
- [ ] Admin: create Sellable, add variants, assign to collection.

---

## 7. File Change Summary

| Action | Files |
|--------|-------|
| **Create** | `models/Sellable.js`, `SellableVariant.js`, `SellableCategory.js`, `SellableKind.js`, `SellableCollection.js` |
| **Create** | `repos/sellable.repo.js`, `sellableVariant.repo.js`, `sellableCategory.repo.js`, `sellableKind.repo.js` |
| **Create** | `services/sellableVariant.service.js` (or extend cartableItem) |
| **Create** | Migrations: sellable tables, data migration, cart/order line updates |
| **Update** | `models/index.js` — associations |
| **Update** | `repos/cart.repo.js`, `collection.repo.js`, `order.repo.js`, `orderLine.repo.js` |
| **Update** | `services/cart.service.js`, `order.service.js` |
| **Update** | `controllers/web/collections.controller.js`, new sellables controller |
| **Update** | `routes/web/index.js` — clean URL, sellables routes |
| **Update** | `controllers/api/cart.controller.js` |
| **Update** | Views: collections/show, new sellables/show, cart, checkout |
| **Update** | Admin: products, services, collections, cartable-items → sellables |
| **Deprecate** | CartableItem, Product, Service (after full migration) |

---

## 8. Estimated Effort

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| Phase 1: Schema | 1–2 days | None |
| Phase 2: Data migration | 1–2 days | Phase 1 |
| Phase 3: Models | 0.5 day | Phase 1, 2 |
| Phase 4: Repos & services | 1–2 days | Phase 3 |
| Phase 5: Controllers & routes | 1 day | Phase 4 |
| Phase 6: Admin | 1–2 days | Phase 4 |
| Phase 7: Views | 1 day | Phase 5 |
| Phase 8: Cleanup | 0.5–1 day | Phase 7 |

**Total:** ~7–12 days for production-grade implementation.

---

## 9. TODOs for Manual Review

1. **MetaObject:** ProductMetaObject, ServiceMetaObject — migrate to SellableMetaObject?
2. **Tags:** ProductTag — SellableTag?
3. **Fulfillment:** Order paid → trigger fulfillment (e.g. course enrollment). Needs fulfillment service per SellableCategory.
4. **Stripe:** Product/Price IDs — map to SellableVariant for Stripe Checkout?
5. **Slug uniqueness:** Sellable slug must be globally unique (products + services + webinars in same space).

---

## 10. Opinion: Will This Improve the Application?

**Short answer: Yes, with caveats.**

### Benefits

1. **Unified mental model** — One abstraction (Sellable + Variant) instead of Product/Service + CartableItem. New developers and AI assistants can reason about the domain more easily.

2. **Extensibility** — Adding webinars, courses, or subscriptions does not require new tables or polymorphic type resolvers. Create a Sellable with the right category and variants.

3. **Consistent cart/checkout** — Cart and Order always reference SellableVariant. No branching on `cartableType` or `referenceId`. Fulfillment logic can key off `SellableVariant.fulfillmentType` or `Sellable.sellableCategoryId`.

4. **Collections become powerful** — A single "Webinars" collection can list Sellables of category webinar. No need for separate /products, /services, /webinars routes—collections handle listing.

5. **Clean URLs** — `/webinars`, `/courses` as collection slugs improve SEO and UX. Menu items can link directly.

6. **Price and offer clarity** — Price lives on the variant (the offer), not scattered across ProductPrice and CartableItem. Free vs paid is a variant choice.

### Trade-offs

1. **Migration cost** — Significant refactor. Data migration, dual-write periods, and regression risk. Budget 1–2 weeks and thorough testing.

2. **Temporary complexity** — During transition, both old and new paths may coexist. More code paths to maintain until cleanup.

3. **Slug namespace** — Products, services, webinars share one slug space. A product "consulting" and a service "consulting" cannot coexist. Plan slug conventions (e.g. `product-consulting`, `service-consulting` or category prefixes).

4. **Admin UX change** — Admins used to "Products" and "Services" will see "Sellables" with a category dropdown. Training or good defaults help.

### Recommendation

**Proceed if:**
- You plan to add webinars, courses, or other sellable types soon.
- The current Product/Service split and CartableItem polymorphism cause friction.
- You want cleaner URLs and collection-driven navigation.

**Defer if:**
- You only sell physical products and a few services, and the current model works.
- You have limited bandwidth for a multi-phase migration.
- You prefer incremental evolution (e.g. keep Products, add Sellable only for new types) over a full migration.

**Hybrid option:** Introduce Sellable/SellableVariant for *new* types (webinars, courses) only. Keep Product/Service for existing catalog. Cart references SellableVariant; ProductVariant gets a corresponding SellableVariant created on migration. This reduces scope but retains some duality.
