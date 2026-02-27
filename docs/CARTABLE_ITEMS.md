# Cartable Items

## Overview

Cartable Items provide a polymorphic abstraction for sellable units. Instead of cart lines referencing product variants directly, they reference **CartableItem** records that can link to products, courses, webinars, or any future entity type.

## Benefits

- **Extensibility**: Add courses, webinars, or other sellable types without changing cart/order schema
- **Feature toggle**: `isCartable` controls whether an item can be added to cart (e.g. free presentations stay non-cartable)
- **Unified cart**: One cart for all sellable types
- **Order snapshot**: Order lines store title, price, and reference for fulfillment

## Schema

### CartableItem

| Field | Type | Purpose |
|-------|------|---------|
| type | STRING | `product_variant`, `service`, `course`, `webinar` |
| referenceId | UUID | FK to ProductVariant, Course, Webinar, etc. |
| title | STRING | Display name |
| price | DECIMAL | Sell price |
| currency | STRING | Default USD |
| isCartable | BOOLEAN | When false, no add-to-cart |
| active | BOOLEAN | Soft enable/disable |

### CartLine

- `cartableItemId` (replaces `productVariantId`)

### OrderLine

- `cartableItemId`, `cartableType`, `cartableReferenceId`, `title` (snapshot)
- `productVariantId` kept for backward compatibility

## Admin

- **CRUD**: `/admin/cartable-items`
- **Sidebar**: "Cartable Items" and "Services" links in admin nav
- **Create**: Select type (product_variant, service), reference (product variant or service), set price, isCartable, active
- **Services**: Admin CRUD at `/admin/services` for defining services; link them via Cartable Items

## Adding New Types (Course, Webinar)

1. Create `Course` and `Webinar` models
2. Add migrations for their tables
3. Extend admin Cartable Items form to show course/webinar selectors when type is selected
4. Add fulfillment logic in `order.service` when order is paid (e.g. create Registration for courses)

## Migration

Existing product variants were seeded with CartableItem records. New products auto-create a CartableItem on creation. Cart lines were migrated from productVariantId to cartableItemId.
