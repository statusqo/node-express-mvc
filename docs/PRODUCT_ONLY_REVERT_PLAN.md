# Product-Only Architecture — Revert Plan

**Status:** Implemented (completed)  
**Architectural North Star:** *"Product is the thing. ProductVariant is the offer. Cart and Order reference ProductVariant directly."*

---

## Executive Summary

This plan reverts the polymorphic CartableItem architecture and consolidates all sellable entities (products, services, and future types) into the **Product** model. Product already has variants, product type, product category, and metaobjects—sufficient to represent anything sellable. Cart and Order will reference `productVariantId` directly, eliminating CartableItem and the separate Service model.

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
| **ProductType** | Product type enum (e.g. course) | — |
| **ProductMetaObject** | Product ↔ MetaObject | — |
| **ServiceMetaObject** | Service ↔ MetaObject | — |

### 1.2 Key Touchpoints (Files to Modify)

| Layer | Files |
|-------|-------|
| **Models** | `CartLine.js`, `OrderLine.js`, `index.js` (associations) |
| **Repos** | `cart.repo.js`, `order.repo.js`, `orderLine.repo.js`, `product.repo.js`, `collection.repo.js` |
| **Services** | `cart.service.js`, `order.service.js` |
| **Controllers (web)** | `products.controller.js`, `cart.controller.js` |
| **Controllers (api)** | `api/cart.controller.js` |
| **Controllers (admin)** | `products.controller.js`, `cartableItems.controller.js`, `services.controller.js` |
| **Views** | `products/show.pug`, `products/index.pug`, `services/*.pug`, `cart-drawer.js`, `checkout.pug`, `order.pug` |
| **Routes** | `web/index.js`, `admin/index.js`, `api/cart.routes.js` |
| **Migrations** | New migrations for schema changes + data migration |

### 1.3 Data Flow Today

1. **Product creation:** `product.repo.create` → Product + ProductVariant + ProductPrice + **CartableItem**
2. **Service creation:** `service.repo.create` → Service (no price). Admin creates CartableItem separately.
3. **Add to cart:** `cartableItemId` → CartableItem → resolve type + referenceId for display/order
4. **Order creation:** `cartableItemService.getOrderLineSnapshot(cartableItemId)` → title, price, productVariantId (if product_variant)
5. **Price source:** Product → ProductPrice on variant; Service → CartableItem.price

---

## 2. Target Domain Model

### 2.1 Simplified Entities

| Entity | Purpose | Replaces |
|--------|---------|----------|
| **Product** | All sellable items (products, services, courses, webinars) | Product, Service |
| **ProductVariant** | Commercial offer: one per Product (default for services), many for products | — |
| **ProductPrice** | Price per variant | — |
| **ProductType** | Type enum (physical, digital, service, course, webinar) | — |
| **ProductCategory** | Taxonomy | — |
| **ProductMetaObject** | Product ↔ MetaObject | ProductMetaObject, ServiceMetaObject |
| **ProductCollection** | Collection ↔ Product | — |

### 2.2 Removed Entities

| Entity | Action |
|--------|--------|
| **CartableItem** | Remove entirely |
| **Service** | Migrate to Product (productTypeId = service) |
| **ServiceMetaObject** | Migrate to ProductMetaObject |

### 2.3 Relationships (Target)

```
Product
  ├── productTypeId → ProductType
  ├── productCategoryId → ProductCategory
  ├── hasMany ProductVariant
  ├── belongsToMany Collection (through ProductCollection)
  └── belongsToMany MetaObject (through ProductMetaObject)

ProductVariant
  ├── productId → Product
  └── hasMany ProductPrice

CartLine
  └── productVariantId → ProductVariant (replaces cartableItemId)

OrderLine
  └── productVariantId → ProductVariant (required for new orders)
  └── title (snapshot, kept for display)
  └── price (snapshot, kept for display)
```

### 2.4 Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Cart/Order reference ProductVariant** | ProductVariant is the purchasable unit; price lives on ProductPrice. Direct FK is simpler than polymorphism. |
| **Services = Product with productTypeId** | ProductType "service" distinguishes services. One default variant per service. |
| **ProductType expansion** | Add "service" (and optionally "webinar", "course") to product_types. |
| **Keep OrderLine.title, price** | Snapshot for historical display; productVariantId for fulfillment/reference. |
| **Single meta object join** | ProductMetaObject only; ServiceMetaObject data migrates into ProductMetaObject. |

---

## 3. Implementation Phases

### Phase 1: Schema Preparation

**Goal:** Add ProductType "service", ensure OrderLine can work with productVariantId only.

#### 1.1 Seed ProductType "service"

- **Migration:** Insert `product_types` row: `{ name: "Service", slug: "service" }` if not exists.
- **Seeder:** Ensure demo/seed data includes service type.

#### 1.2 CartLine: Add productVariantId (Dual-Write Period)

- **Migration:** Add `productVariantId` (nullable, FK to product_variants) to `cart_lines`.
- **Keep** `cartableItemId` during transition for backward compatibility.
- **Index:** Unique on `(cartId, productVariantId)` for new flow.

#### 1.3 OrderLine: Ensure productVariantId Populated

- OrderLine already has `productVariantId` (nullable). New orders will always set it.
- No schema change needed; `createLineFromCartable` already sets it when snapshot has productVariantId.
- For service orders: after migration, all will have productVariantId (from migrated Product).

---

### Phase 2: Data Migration — Services → Products

**Goal:** Migrate all Services to Products with one default variant and price.

#### 2.1 Migration Script: Services → Products

For each Service:

1. Get CartableItem for `type=service`, `referenceId=service.id` (if exists).
2. Create Product:
   - `title`, `slug`, `description`, `active` from Service
   - `productTypeId` = ProductType where slug='service'
   - `productCategoryId` = null (or create "Services" category if desired)
3. Create ProductVariant:
   - `productId` = new Product.id
   - `title` = "Default"
   - `isDefault` = true
   - `active` = true
4. Create ProductPrice:
   - `productVariantId` = new variant.id
   - `amount` = CartableItem.price (or 0 if no CartableItem)
   - `currency` = CartableItem.currency or "USD"
   - `isDefault` = true
5. Build mapping: `serviceId` → `{ productId, productVariantId }`
6. Migrate ServiceMetaObject → ProductMetaObject:
   - For each ServiceMetaObject(serviceId): create ProductMetaObject(productId from mapping, metaObjectId, sortOrder, values)

#### 2.2 Migration Script: Cart Lines

For each CartLine with cartableItemId:

1. Load CartableItem.
2. If `type === "product_variant"`: `productVariantId` = item.referenceId.
3. If `type === "service"`: `productVariantId` = mapping[item.referenceId].productVariantId.
4. Update CartLine: set `productVariantId`.
5. Cart lines for CartableItems that don't resolve (orphaned) → drop or log.

#### 2.3 Migration Script: Cart Lines Schema Switch

- Create new `cart_lines` table with `productVariantId` (not null), drop `cartableItemId`.
- Copy data: cartId, productVariantId (from migration), quantity.
- Drop old table; rename new.
- Or: alter table, backfill productVariantId, then drop cartableItemId column.

#### 2.4 Migration Script: Order Lines

- Existing OrderLines: many already have `productVariantId` (from product_variant CartableItems).
- For OrderLines with `cartableType=service` and `cartableReferenceId`: set `productVariantId` from service→product mapping.
- Keep `title`, `price` for display; ensure `productVariantId` is set for all.

---

### Phase 3: Code Changes — Remove CartableItem, Use ProductVariant

**Goal:** Cart and Order flow uses productVariantId only.

#### 3.1 product.repo.js

- **Remove:** CartableItem.create in `create()`.
- **Remove:** CartableItem import.
- Product create: Product + ProductVariant + ProductPrice only.

#### 3.2 cart.repo.js

- **Replace** `cartableItemId` with `productVariantId` in all methods.
- **Replace** `defaultLineInclude`: include ProductVariant (and Product, ProductPrice) instead of CartableItem.
- **Update:** addLine, removeLine, setLineQuantity, getLines — all use productVariantId.

#### 3.3 cart.service.js

- **Replace** `addToCart(userId, sessionId, productVariantId, quantity)`.
- **Replace** validation: use productVariantRepo or ProductVariant.findByPk — ensure variant exists, active, and has a default price.
- **Remove** cartableItemService dependency.

#### 3.4 order.service.js

- **Replace** `getCartTotalForPayment`: sum from ProductVariant → ProductPrice (or from cart line include).
- **Replace** `createOrderFromCart`: for each cart line, get productVariantId → resolve Product + ProductPrice for snapshot → create OrderLine with productVariantId, title, price.
- **Remove** cartableItemService.getOrderLineSnapshot.
- **Add** `getOrderLineSnapshotFromVariant(productVariantId)` in productVariant.repo or new helper: returns { productVariantId, title (from Product), price, currency }.

#### 3.5 order.repo.js

- **Replace** `createLineFromCartable` with `createLineFromVariant(orderId, { productVariantId, title, price, currency }, quantity)`.
- **Update** `defaultLineInclude`: ProductVariant + Product + ProductPrice; remove CartableItem.
- **Simplify** getLines include.

#### 3.6 Delete cartableItem.service.js, cartableItem.repo.js

- Remove files.
- Remove all imports.

---

### Phase 4: Controllers & Routes

#### 4.1 Web: products.controller.js

- **Remove** cartableItemRepo usage.
- **Add to cart:** pass `productVariantId` (default variant id) instead of cartableItemId.
- **Index/show:** include ProductVariant + ProductPrice; no cartableItem lookup.
- **Add to cart form:** `productVariantId` hidden input instead of cartableItemId.

#### 4.2 Web: services.controller.js → Merge or Redirect

**Option A — Merge into products:**  
- Remove `/services` routes.
- Add `GET /products?type=service` filter.
- Redirect `/services` → `/products?type=service`.
- Redirect `/services/:slug` → `/products/:slug` (Product slug from migrated service).

**Option B — Keep /services as product filter:**  
- `services.controller.index` → fetch products where productTypeId = service type; render products/index or services/index.
- `services.controller.show` → findBySlug on Product where productTypeId = service; render products/show or services/show.
- Uses productRepo; no serviceRepo.

**Recommended:** Option B for minimal URL change; reuse product views with optional layout variant.

#### 4.3 Web: cart.controller.js

- **Add to cart:** accept `productVariantId` (from form/API).
- **Update/remove:** accept `productVariantId` instead of cartableItemId.

#### 4.4 API: cart.controller.js

- **Add:** `productVariantId` in request body.
- **Response:** include productVariantId in line payload (not cartableItemId).
- **Update/remove:** use productVariantId.

#### 4.5 Admin: products.controller.js

- Ensure product form supports productTypeId (including "service").
- No CartableItem creation; product create already creates variant + price.

#### 4.6 Admin: services.controller.js → Remove or Redirect

- **Option A:** Delete. Redirect `/admin/services` → `/admin/products?type=service`.
- **Option B:** Keep as filtered view of products (productTypeId = service). Reuse product form with type pre-selected.

**Recommended:** Option A — single products admin; filter by type in UI.

#### 4.7 Admin: cartableItems.controller.js → Remove

- Delete controller.
- Remove routes: `/admin/cartable-items/*`.
- Remove sidebar link.

---

### Phase 5: Views & Frontend

#### 5.1 products/show.pug, products/index.pug

- Replace `cartableItemId` with `productVariantId` in add-to-cart form.
- `input(type="hidden" name="productVariantId" value=defaultVariantId)`

#### 5.2 services/show.pug, services/index.pug

- **If keeping /services routes:** Pass `productVariantId` (from migrated Product's default variant) instead of cartableItemId.
- **If redirecting to products:** Delete or redirect.

#### 5.3 cart-drawer.js

- Replace `cartableItemId` with `productVariantId` in data attributes and API calls.
- `data-product-variant-id`, updateQuantity(productVariantId), removeItem(productVariantId).

#### 5.4 checkout.pug, order.pug

- Display: use `line.ProductVariant` and `line.Product` (or line.title) for display.
- Remove CartableItem reference.

#### 5.5 API cart response shape

- Lines: `{ productVariantId, quantity, ProductVariant: { ... }, Product: { ... } }` or similar.
- Remove cartableItemId from response.

---

### Phase 6: Model & Association Updates

#### 6.1 models/index.js

- **Remove:** CartableItem, Service, ServiceMetaObject imports and associations.
- **Update:** CartLine belongsTo ProductVariant (productVariantId).
- **Update:** OrderLine belongsTo ProductVariant (productVariantId).
- **Remove:** CartableItem hasMany CartLine, CartableItem hasMany OrderLine.
- **Remove:** Service, ServiceMetaObject associations.

#### 6.2 models/CartLine.js

- Replace `cartableItemId` with `productVariantId`.

#### 6.3 models/OrderLine.js

- Keep `productVariantId` (required for new orders).
- Optionally deprecate `cartableItemId`, `cartableType`, `cartableReferenceId` (keep for historical order display if needed; new orders won't set them).

---

### Phase 7: Drop Legacy Tables & Cleanup

#### 7.1 Migrations (Order Matters)

1. **Drop CartableItem references:**
   - CartLine: already migrated to productVariantId.
   - OrderLine: cartableItemId can be nullable; set to null for old rows or leave.
2. **Drop cartable_items table.**
3. **Drop services table.**
4. **Drop service_meta_objects table.**
5. **Remove cartableItemId from cart_lines** (if not already done in Phase 2).
6. **Remove cartableItemId, cartableType, cartableReferenceId from order_lines** (optional; keep for audit).

#### 7.2 Menu & Redirects

- Update menu items: `/services` → `/products?type=service` or keep `/services` if controller serves product-filtered view.
- Add 301 redirects: `/services/:slug` → `/products/:slug` if slugs are merged (ensure no slug collision: services and products share slug space after migration).

#### 7.3 Slug Uniqueness

- Products and migrated Services share slug space. Migration must ensure Service slugs don't conflict with existing Product slugs. Prefer prefix (e.g. `service-{slug}`) or validate uniqueness before migration.

---

## 4. File Change Summary

| Action | Files |
|--------|-------|
| **Modify** | `models/CartLine.js`, `models/OrderLine.js`, `models/index.js` |
| **Modify** | `repos/cart.repo.js`, `repos/order.repo.js`, `repos/product.repo.js`, `repos/productVariant.repo.js`, `repos/collection.repo.js` |
| **Modify** | `services/cart.service.js`, `services/order.service.js` |
| **Modify** | `controllers/web/products.controller.js`, `controllers/web/cart.controller.js`, `controllers/web/services.controller.js` (or remove) |
| **Modify** | `controllers/api/cart.controller.js` |
| **Modify** | `controllers/admin/products.controller.js` |
| **Delete** | `models/CartableItem.js`, `models/Service.js`, `models/ServiceMetaObject.js` |
| **Delete** | `repos/cartableItem.repo.js`, `services/cartableItem.service.js` |
| **Delete** | `controllers/admin/cartableItems.controller.js`, `controllers/admin/services.controller.js` (if merging) |
| **Modify** | Views: `products/show.pug`, `products/index.pug`, `services/show.pug`, `services/index.pug`, `checkout.pug`, `order.pug` |
| **Modify** | `public/js/cart-drawer.js` |
| **Modify** | Routes: `web/index.js`, `admin/index.js`, `api/cart.routes.js` |
| **Create** | Migrations: product_type service seed, cart_lines productVariantId, services→products data, service_meta_objects→product_meta_objects, cart lines migration, order lines backfill, drop tables |

---

## 5. Migration Reversibility

| Phase | Reversible? | Notes |
|-------|-------------|-------|
| Phase 1 | Yes | Additive; down migration drops new columns. |
| Phase 2 | Partial | Data migration; can restore from backup. Original tables kept until Phase 7. |
| Phase 3–6 | Yes | Code changes; revert via git. |
| Phase 7 | No | Dropping tables is one-way. Full backup required before. |

---

## 6. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Slug collision (Service vs Product) | Check for conflicts before migration; use `service-` prefix or reject migration if conflict. |
| Orphaned cart lines | CartableItems without resolvable ProductVariant → drop lines or log. |
| Historical order display | Keep OrderLine.title for display; productVariantId for new orders. Old orders with only cartableItemId: optional view fallback to title. |
| Menu links break | Update menu URLs in migration or admin. |
| Services in collections | Services don't use ProductCollection today. After migration, services are Products—can be added to collections via ProductCollection. |

---

## 7. Testing Checklist

- [ ] Create Product (physical) → add to cart (productVariantId) → checkout → order created.
- [ ] Create Product (type=service) → add to cart → checkout.
- [ ] Migrated Service → appears as Product; add to cart works.
- [ ] Cart drawer: add, update quantity, remove by productVariantId.
- [ ] Order history: lines display correctly (ProductVariant or title).
- [ ] Admin: create Product with type=service; no CartableItem.
- [ ] Admin: products list; filter by type (optional).
- [ ] `/services` route: shows products with type=service (or redirects).
- [ ] Collections: products (including migrated services) display.

---

## 8. Optional Enhancements (Post-Revert)

1. **ProductVariant.isCartable** — For free/non-purchasable variants (e.g. free webinar access). Default true.
2. **ProductType expansion** — Add "webinar", "course" as needed.
3. **Unified listing route** — `GET /products` with `?type=service` filter; `/services` as alias.
4. **Collection includes services** — After migration, add migrated Products (ex-services) to collections via admin.

---

## 9. Estimated Effort

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| Phase 1: Schema | 0.5 day | None |
| Phase 2: Data migration | 1–2 days | Phase 1 |
| Phase 3: Repos & services | 1 day | Phase 2 |
| Phase 4: Controllers & routes | 1 day | Phase 3 |
| Phase 5: Views | 0.5 day | Phase 4 |
| Phase 6: Models | 0.5 day | Phase 3 |
| Phase 7: Cleanup | 0.5 day | Phase 5, 6 |

**Total:** ~5–6 days for production-grade implementation.

---

## 10. Appendix: Current File Reference

### Models
- `CartLine`: cartableItemId
- `OrderLine`: productVariantId, cartableItemId, cartableType, cartableReferenceId, title, price
- `CartableItem`: type, referenceId, title, price, currency, isCartable, active
- `Service`: title, slug, description, active
- `Product`: title, slug, description, productTypeId, productCategoryId, active
- `ProductVariant`: productId, title, sku, isDefault, active
- `ProductPrice`: productVariantId, amount, currency, isDefault

### Key Repos
- `cart.repo`: addLine(cartId, cartableItemId), getLines (include CartableItem)
- `order.repo`: createLineFromCartable(orderId, snapshot, quantity)
- `product.repo`: create → Product + Variant + Price + CartableItem
- `cartableItem.repo`: findById, findByTypeAndReference, findCartableByProductVariantId, findCartableByServiceId

### Key Services
- `cart.service`: addToCart(userId, sessionId, cartableItemId, quantity)
- `order.service`: createOrderFromCart uses cartableItemService.getOrderLineSnapshot(cartableItemId)
- `cartableItem.service`: getCartableItemForCart, getOrderLineSnapshot, createForProductVariant
