const { z } = require("zod");

const addManageableVariantSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(255),
  priceAmount: z.coerce.number().refine((n) => !Number.isNaN(n) && n >= 0, "Price must be a number ≥ 0."),
  quantity: z
    .union([z.string(), z.number(), z.undefined(), z.null()])
    .optional()
    .transform((v) => {
      if (v === "" || v === undefined || v === null) return 0;
      const n = parseInt(String(v), 10);
      return Number.isFinite(n) && n >= 0 ? n : -1;
    })
    .refine((n) => n >= 0, "Quantity must be a non-negative integer."),
  sku: z
    .union([z.string(), z.undefined(), z.null()])
    .optional()
    .transform((v) => (v == null || String(v).trim() === "" ? null : String(v).trim()))
    .refine((v) => v === null || v.length <= 120, "SKU is too long."),
  active: z
    .union([z.boolean(), z.literal("on"), z.undefined(), z.null()])
    .optional()
    .transform((v) => v === true || v === "on"),
});

function validateAddManageableVariant(body) {
  const parsed = addManageableVariantSchema.safeParse(body || {});
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(" ");
    return { ok: false, error: msg || "Invalid variant data." };
  }
  return {
    ok: true,
    data: {
      title: parsed.data.title,
      priceAmount: parsed.data.priceAmount,
      quantity: parsed.data.quantity,
      sku: parsed.data.sku,
      active: parsed.data.active === true,
    },
  };
}

module.exports = { validateAddManageableVariant };
