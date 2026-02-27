const { z } = require("zod");

const AddToCartSchema = z.object({
  productVariantId: z.string().uuid("Invalid product variant id"),
  quantity: z.coerce.number().int().min(1).max(99).default(1),
});

const UpdateCartLineSchema = z.object({
  productVariantId: z.string().uuid("Invalid product variant id"),
  quantity: z.coerce.number().int().min(0).max(99),
});

const RemoveFromCartSchema = z.object({
  productVariantId: z.string().uuid("Invalid product variant id"),
});

function validateAddToCart(body) {
  const result = AddToCartSchema.safeParse(body);
  if (!result.success) return { ok: false, errors: result.error.issues };
  return { ok: true, data: result.data };
}

function validateUpdateCartLine(body) {
  const result = UpdateCartLineSchema.safeParse(body);
  if (!result.success) return { ok: false, errors: result.error.issues };
  return { ok: true, data: result.data };
}

function validateRemoveFromCart(body) {
  const result = RemoveFromCartSchema.safeParse(body);
  if (!result.success) return { ok: false, errors: result.error.issues };
  return { ok: true, data: result.data };
}

module.exports = { validateAddToCart, validateUpdateCartLine, validateRemoveFromCart };
