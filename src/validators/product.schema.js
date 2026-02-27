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
  currency: z.string().trim().max(3).optional().transform((v) => (v && v.trim() ? v.trim().substring(0, 3) : "USD")),
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
      currency: parsed.data.currency,
      quantity: parsed.data.quantity ?? 0,
      active: parsed.data.active ?? false,
      isPhysical: parsed.data.isPhysical ?? false,
      weight: parsed.data.weight,
      weightUnit: parsed.data.weightUnit,
    },
  };
}

module.exports = { validateProduct };
