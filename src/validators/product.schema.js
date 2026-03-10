const { z } = require("zod");

const slugSchema = z
  .string()
  .trim()
  .transform((s) => s.toLowerCase())
  .pipe(z.string().min(1, "Slug is required.").max(255).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only."));

const ProductSchema = z.object({
  title: z.string().min(1, "Title is required.").trim().max(255),
  slug: z.string().trim().max(255).optional().nullable(),
  description: z.string().trim().max(10000).optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null)),
  productTypeId: z.string().trim().max(36).optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null)),
  productCategoryId: z.string().trim().max(36).optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null)),
  priceAmount: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === "" || v === undefined || v === null ? undefined : Number(v)))
    .refine((n) => n === undefined || (!Number.isNaN(n) && n >= 0), "Price must be a number."),
  // currency cannot be changed; it always matches DEFAULT_CURRENCY
  currency: z.string().optional().transform(() => undefined),
  quantity: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === "" || v === undefined || v === null ? 0 : Math.max(0, parseInt(String(v), 10) || 0))),
  active: z.union([z.literal("on"), z.undefined()]).optional().transform((v) => v === "on"),
  isPhysical: z.union([z.literal("on"), z.undefined()]).optional().transform((v) => v === "on"),
  weight: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v) => (v === "" || v === undefined || v === null ? null : Number(v))),
  weightUnit: z.string().trim().max(10).optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null)),
  vatRate: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === "" || v === undefined || v === null ? 25 : parseInt(String(v), 10)))
    .refine((n) => [0, 5, 13, 25].includes(n), "VAT rate must be 0, 5, 13, or 25."),
});

function validateProduct(body, slugValue) {
  const parsed = ProductSchema.safeParse(body);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues };
  const slugToCheck = slugValue ?? parsed.data.slug ?? "";
  const slugResult = slugSchema.safeParse(slugToCheck.toLowerCase());
  if (!slugResult.success) return { ok: false, errors: slugResult.error.issues };
  return {
    ok: true,
    data: {
      title: parsed.data.title.trim(),
      slug: slugResult.data,
      description: parsed.data.description,
      productTypeId: parsed.data.productTypeId,
      productCategoryId: parsed.data.productCategoryId,
      priceAmount: parsed.data.priceAmount,
      currency: undefined, // will be set server‑side to DEFAULT_CURRENCY
      quantity: parsed.data.quantity ?? 0,
      active: parsed.data.active ?? false,
      isPhysical: parsed.data.isPhysical ?? false,
      weight: parsed.data.weight,
      weightUnit: parsed.data.weightUnit,
      vatRate: parsed.data.vatRate ?? 25,
    },
  };
}

module.exports = { validateProduct };
