# Architecture Refactor Plan: Routes → Controllers → Services → Repos → Models

> **Status: COMPLETED** – Refactoring executed. All controllers now follow the pattern.

This document outlines a step-by-step plan to refactor the codebase so that **all request-response cycles** strictly follow the agreed architecture pattern:

```
Routes → Controllers → Services → Repos → Models
```

---

## Audit Coverage (All Files Verified)

**Controllers checked:** admin (9), web (12), api (3), auth (1)  
**Services checked:** 10  
**Middlewares checked:** 2 (cartDrawer, menu – both use services ✓)  
**Validators:** No repo/model imports ✓  
**App.js:** Uses userRepo directly ✗  

---

## Current State Summary

### ✅ Files Already Compliant

| Layer | Files | Notes |
|-------|-------|-------|
| **Controllers** | `dashboard.controller.js`, `checkout.controller.js`, `orders.controller.js`, `addresses.controller.js`, `cart.controller.js` (web), `auth.controller.js`, `contact.controller.js` (web), `cart.controller.js` (api), `contact.controller.js` (api), `home.controller.js`, `health.controller.js`, `stripe.controller.js` | Use services only |
| **Controllers** | `paymentMethods.controller.js` | Uses paymentMethodService + gateway |
| **Middlewares** | `cartDrawer.middleware.js`, `menu.middleware.js` | Use cartService, menuService ✓ |
| **Services** | `admin.service.js`, `menu.service.js`, `cart.service.js`, `order.service.js`, `address.service.js`, `paymentMethod.service.js`, `email.service.js` | Use repos only (except user.service – see violations). Stripe is handled by `gateways/stripe.gateway.js`. |

### ❌ Violations Found

#### 1. Controllers Importing Repos Directly (12 controllers)

| Controller | Repos Used | Also Imports Models? |
|------------|------------|----------------------|
| `admin/products.controller.js` | productRepo, productTypeRepo, productCategoryRepo, metaObjectRepo | Yes (ProductVariant, ProductPrice, ProductType, MetaObject) |
| `admin/collections.controller.js` | collectionRepo | No |
| `admin/posts.controller.js` | postRepo | No |
| `admin/users.controller.js` | userRepo | No (but also uses userService, orderService) |
| `admin/menus.controller.js` | menuRepo | No |
| `admin/menuItems.controller.js` | menuRepo | No |
| `admin/metaObjects.controller.js` | metaObjectRepo | No |
| `admin/productTypes.controller.js` | productTypeRepo | No |
| `web/products.controller.js` | productRepo | Yes (ProductVariant, ProductPrice, MetaObject) |
| `web/collections.controller.js` | collectionRepo | No |
| `web/blog.controller.js` | postRepo | No |
| `web/account.controller.js` | userRepo | No (saveProfile only) |

#### 2. Controllers Importing Models Directly (2 controllers)

| Controller | Models Used |
|------------|-------------|
| `admin/products.controller.js` | ProductVariant, ProductPrice, ProductType, MetaObject |
| `web/products.controller.js` | ProductVariant, ProductPrice, MetaObject |

#### 3. App-Level / Middleware Violations

| File | Issue |
|------|-------|
| `app.js` | Imports `userRepo` directly for session user lookup middleware |

#### 4. Service Layer Violations

| Service | Issue |
|---------|-------|
| `user.service.js` | Imports `Address`, `Cart`, `Order`, `PaymentMethod`, `UserGatewayProfile` models directly in `deleteUser()` instead of using repos |

#### 5. Gateways (Out of Scope for Request-Response)

`gateways/stripe.gateway.js` uses repos directly. Gateways are infrastructure for payment processing; they are called by services. For consistency, consider routing gateway data access through a service layer, but this is lower priority than controller refactoring.

---

## Step-by-Step Refactoring Plan

### Phase 1: Create Missing Services

Create services for domains that currently have controllers calling repos directly.

#### Step 1.1: Create `product.service.js`

**Purpose:** Encapsulate all product-related business logic. Used by both admin and web product controllers.

**Methods to implement:**
- `findAll(options)` – admin: all products with variants/prices
- `findAllActive(options)` – web: active products with default variant/price
- `findById(id, options)` – admin: product by ID with includes
- `findActiveBySlug(slug, options)` – web: active product by slug with metaObjects
- `create(data)` – admin: create product with meta objects
- `update(id, data)` – admin: update product
- `delete(id)` – admin: delete product
- `getFormData()` – admin: types, categories, metaObjects for form (new/edit)

**Repos used:** product.repo, productType.repo, productCategory.repo, metaObject.repo

**Note:** The product repo accepts `include` options with models. The service should either:
- Accept include options and pass through (leaky abstraction), or
- Define canonical include presets and expose methods like `findAllWithDefaultVariant()`, `findActiveBySlugWithMeta()` etc.

**Recommendation:** Add service methods with clear semantics; the service constructs the include options internally using model references from the repo layer. Repos may need to accept model references for complex includes—or extend product.repo with methods like `findAllWithDefaultVariant()` that encapsulate the include logic.

---

#### Step 1.2: Create `collection.service.js`

**Purpose:** Collections for admin and web.

**Methods:**
- `findAllForAdmin()` – admin index
- `findAll(options)` – web: active collections
- `findById(id)` – admin edit
- `findActiveBySlug(slug)` – web show
- `getProducts(collectionId)` – products in collection
- `create(data)` – admin
- `update(id, data)` – admin
- `delete(id)` – admin

**Repos used:** collection.repo

---

#### Step 1.3: Create `post.service.js`

**Purpose:** Blog posts for admin and web.

**Methods:**
- `findAll()` – admin index
- `findPublished()` – web blog index
- `findById(id)` – admin edit
- `findBySlug(slug)` – web blog post
- `create(data)` – admin
- `update(id, data)` – admin
- `delete(id)` – admin

**Repos used:** post.repo

---

#### Step 1.4: Extend `user.service.js`

**Current methods:** `deleteUser`, `listUsers`, `getUserById`, `createUser`, `updateUser`

**Add methods:**
- `findAll()` – admin users index
- `findByEmail(email)` – used by admin create/update
- `findByUsername(username)` – used by admin create/update
- `findByIdForAdmin(id)` – admin edit form
- `updateProfile(id, data)` – web account saveProfile (forename, surname, mobile)

**App.js session lookup:** Add `userService.findByIdForSession(userId)` that wraps `userRepo.findByIdForAdmin()`.

---

#### Step 1.5: Extend `menu.service.js`

**Current methods:** `getMenuTree`, `getAllMenusForLayout`

**Add methods (admin CRUD):**
- `findAllMenus(options)` – admin menus index
- `countMenuItems(menuId)` – admin menus index
- `findMenuById(id)` – admin edit
- `findMenuBySlug(slug)` – admin create/update validation
- `createMenu(data)` – admin
- `updateMenu(id, data)` – admin
- `deleteMenu(id)` – admin
- `findMenuItemsByMenuId(menuId)` – admin menu items
- `findMenuItemById(id)` – admin menu item edit
- `createMenuItem(data)` – admin
- `updateMenuItem(id, data)` – admin
- `deleteMenuItem(id)` – admin

**Repos used:** menu.repo (already)

---

#### Step 1.6: Create `metaObject.service.js`

**Purpose:** Meta objects for admin and product form data.

**Methods:**
- `findAllForAdmin()` – admin index
- `findById(id)` – admin edit
- `create(data)` – admin
- `update(id, data)` – admin
- `delete(id)` – admin

**Repos used:** metaObject.repo

---

#### Step 1.7: Create `productType.service.js`

**Purpose:** Product types for admin.

**Methods:**
- `findAll()` – admin index, product form
- `findById(id)` – admin edit
- `findBySlug(slug)` – admin create/update validation
- `create(data)` – admin
- `update(id, data)` – admin
- `delete(id)` – admin

**Repos used:** productType.repo

---

### Phase 2: Refactor user.service.js – Remove Direct Model Usage

#### Step 2.1: Move Model Operations to Repos

`user.service.deleteUser()` currently uses:
- `PaymentMethod.findAll` → add `paymentMethod.repo.findAllByUserId(userId)` or `deleteByUserId(userId)`
- `UserGatewayProfile.findAll` → add `userGatewayProfile.repo.findAllByUserId(userId)` or `deleteByUserId(userId)`
- `Cart.findAll` → add `cart.repo.findAllByUserId(userId)` or `deleteByUserId(userId)`
- `Address.update` → add `address.repo.unlinkUser(userId)` (set userId to null)
- `Order.update` → add `order.repo.unlinkUser(userId)` (set userId to null)
- `user.destroy` → add `user.repo.delete(id)` or keep destroy via userRepo

**Action:** Add repo methods for cascading delete operations, then refactor `user.service.deleteUser()` to use only repos.

---

### Phase 3: Refactor Controllers

#### Step 3.1: `admin/products.controller.js`

1. Remove: `productRepo`, `productTypeRepo`, `productCategoryRepo`, `metaObjectRepo`, `ProductVariant`, `ProductPrice`, `ProductType`, `MetaObject`
2. Add: `productService = require("../../services/product.service")`
3. Replace all repo/model calls with `productService` methods
4. Move validation helpers (`slugify`, `validateProduct`, `normalizeMetaObjectIds`, `toPlain`) – keep in controller or move to product.service (recommend: keep validation in controller, move `toPlain` to a shared util if needed)

---

#### Step 3.2: `admin/collections.controller.js`

1. Remove: `collectionRepo`
2. Add: `collectionService`
3. Replace repo calls with service calls

---

#### Step 3.3: `admin/posts.controller.js`

1. Remove: `postRepo`
2. Add: `postService`
3. Replace repo calls with service calls

---

#### Step 3.4: `admin/users.controller.js`

1. Remove: `userRepo`
2. Add: `userService` (already partially used)
3. Replace all `userRepo` calls with `userService` methods (findAll, findByEmail, findByUsername, findByIdForAdmin, createUser, updateUser)
4. Keep `orderService.claimGuestOrdersByEmail` as-is

---

#### Step 3.5: `admin/menus.controller.js` & `admin/menuItems.controller.js`

1. Remove: `menuRepo`
2. Add: `menuService`
3. Replace repo calls with menuService methods
4. In `menuItems.controller.js`, remove the inline `require("../../services/menu.service")` and use it at top level

---

#### Step 3.6: `admin/metaObjects.controller.js`

1. Remove: `metaObjectRepo`
2. Add: `metaObjectService`
3. Replace repo calls with service calls

---

#### Step 3.7: `admin/productTypes.controller.js`

1. Remove: `productTypeRepo`
2. Add: `productTypeService`
3. Replace repo calls with service calls

---

#### Step 3.8: `web/products.controller.js`

1. Remove: `productRepo`, `ProductVariant`, `ProductPrice`, `MetaObject`
2. Add: `productService`
3. Replace repo calls with `productService.findAllActive()`, `productService.findActiveBySlug(slug)`
4. Move `parseDefinitionPairs` usage – service can return metaObjects with definitionPairs, or controller can call `parseDefinitionPairs` on service result (validators stay in controller/view layer)

---

#### Step 3.9: `web/collections.controller.js`

1. Remove: `collectionRepo`
2. Add: `collectionService`
3. Replace repo calls with service calls

---

#### Step 3.10: `web/blog.controller.js`

1. Remove: `postRepo`
2. Add: `postService`
3. Replace repo calls with service calls

---

#### Step 3.11: `web/account.controller.js`

1. Remove: `userRepo`
2. Add: `userService` (or `accountService` if profile update lives there)
3. Replace `userRepo.update` in `saveProfile` with `userService.updateProfile(userId, data)` or `account.service.updateProfile`

**Note:** `account.service` currently has `login` and `register`. Profile update could live in `user.service` as `updateProfile` or in `account.service` as `updateProfile`. Recommend `user.service.updateProfile` for consistency with other user CRUD.

---

### Phase 4: Refactor app.js

#### Step 4.1: Session User Middleware

1. Remove: `userRepo`
2. Add: `userService`
3. Replace `userRepo.findByIdForAdmin(req.session.userId)` with `userService.findByIdForSession(req.session.userId)` (or `getUserById` / `findByIdForAdmin` – same method, just ensure it's from service)

---

### Phase 5: Handle Model References in Product Service

#### Challenge

`product.repo` and controllers use Sequelize `include` with models (ProductVariant, ProductPrice, MetaObject). Options:

**Option A:** Repos encapsulate include logic – add methods like:
- `product.repo.findAllWithDefaultVariant(options)`
- `product.repo.findActiveBySlugWithMeta(slug)`

The repo already imports models. The service would call these repo methods and never touch models.

**Option B:** Service passes include config – the service would need to construct include options. That requires model references. To avoid controller→model, the service could:
- Import models (violates Services→Repos→Models if we say Services must not import Models)
- Or receive a "include preset" string from the controller and map it internally

**Recommendation:** **Option A**. Repos already use models. Add higher-level repo methods that encapsulate common include patterns. The service then calls these repo methods. No model imports in service.

---

## Implementation Order

Execute in this order to minimise breaking changes:

1. **Phase 1.4** – Extend user.service (needed for app.js and admin/users, web/account)
2. **Phase 4.1** – Refactor app.js to use userService
3. **Phase 2.1** – Refactor user.service deleteUser to use repos only
4. **Phase 3.11** – Refactor web/account.controller
5. **Phase 3.4** – Refactor admin/users.controller
6. **Phase 1.2** – Create collection.service
7. **Phase 3.2, 3.9** – Refactor admin & web collections controllers
8. **Phase 1.3** – Create post.service
9. **Phase 3.3, 3.10** – Refactor admin posts & web blog controllers
10. **Phase 1.6** – Create metaObject.service
11. **Phase 3.6** – Refactor admin metaObjects.controller
12. **Phase 1.7** – Create productType.service
13. **Phase 3.7** – Refactor admin productTypes.controller
14. **Phase 1.5** – Extend menu.service with admin CRUD
15. **Phase 3.5** – Refactor admin menus & menuItems controllers
16. **Phase 1.1** – Create product.service (most complex: repo extensions for includes)
17. **Phase 5** – Implement product repo methods for includes
18. **Phase 3.1, 3.8** – Refactor admin & web products controllers

---

## Complete Controller Inventory (Verified)

| Controller | Repos? | Models? | Services? | Status |
|------------|--------|---------|------------|--------|
| admin/dashboard | — | — | adminService | ✓ |
| admin/products | productRepo, productTypeRepo, productCategoryRepo, metaObjectRepo | ProductVariant, ProductPrice, ProductType, MetaObject | — | ✗ |
| admin/collections | collectionRepo | — | — | ✗ |
| admin/posts | postRepo | — | — | ✗ |
| admin/users | userRepo | — | userService, orderService | ✗ |
| admin/menus | menuRepo | — | — | ✗ |
| admin/menuItems | menuRepo | — | menuService (inline) | ✗ |
| admin/metaObjects | metaObjectRepo | — | — | ✗ |
| admin/productTypes | productTypeRepo | — | — | ✗ |
| web/products | productRepo | ProductVariant, ProductPrice, MetaObject | — | ✗ |
| web/collections | collectionRepo | — | — | ✗ |
| web/blog | postRepo | — | — | ✗ |
| web/account | userRepo | — | addressService, paymentMethodService, orderService | ✗ |
| web/cart | — | — | cartService | ✓ |
| web/checkout | — | — | orderService, cartService, addressService, paymentMethodService | ✓ |
| web/orders | — | — | orderService | ✓ |
| web/addresses | — | — | addressService | ✓ |
| web/contact | — | — | — | ✓ |
| web/home | — | — | — | ✓ |
| web/paymentMethods | — | — | paymentMethodService, gateway | ✓ |
| web/stripe | — | — | gateways | ✓ |
| api/cart | — | — | cartService | ✓ |
| api/contact | — | — | emailService | ✓ |
| api/health | — | — | — | ✓ |
| auth/auth | — | — | accountService, orderService | ✓ |

---

## Verification Checklist

After refactoring, verify:

- [ ] No controller imports from `repos/` or `models/`
- [ ] No service imports from `models/` (except possibly for type/validation – prefer validators)
- [ ] `app.js` uses `userService` for session user, not `userRepo`
- [ ] All admin CRUD flows go through services
- [ ] All web flows go through services
- [ ] Run full test suite / manual smoke test of: products, collections, blog, users, menus, meta objects, product types, checkout, cart, account

---

## Files to Create

| File | Purpose |
|------|---------|
| `services/product.service.js` | Product CRUD + form data |
| `services/collection.service.js` | Collection CRUD + products |
| `services/post.service.js` | Post CRUD |
| `services/metaObject.service.js` | Meta object CRUD |
| `services/productType.service.js` | Product type CRUD |

## Files to Modify

| File | Changes |
|------|---------|
| `services/user.service.js` | Add findAll, findByEmail, findByUsername, findByIdForAdmin, updateProfile; refactor deleteUser to use repos only |
| `services/menu.service.js` | Add admin CRUD methods |
| `repos/product.repo.js` | Add findAllWithDefaultVariant, findActiveBySlugWithMeta (or similar) |
| `repos/address.repo.js` | Add unlinkUser |
| `repos/order.repo.js` | Add unlinkUser |
| `repos/paymentMethod.repo.js` | Add deleteByUserId or findAllByUserId |
| `repos/userGatewayProfile.repo.js` | Add deleteByUserId or findAllByUserId |
| `repos/cart.repo.js` | Add deleteByUserId or findAllByUserId |
| `app.js` | Use userService instead of userRepo |
| All 12 violating controllers | Switch from repos to services |
