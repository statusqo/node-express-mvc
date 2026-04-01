const { z } = require("zod");
const { UNIT_OF_MEASURE_LIST, WEIGHT_UNIT_LIST } = require("../constants/product");

const slugSchema = z
  .string()
  .trim()
  .transform((s) => s.toLowerCase())
  .pipe(z.string().min(1, "Slug is required.").max(255).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only."));

const taxRateIdRequired = z.string().trim().min(1, "Tax rate is required.").max(36);
const taxRateIdOptional = z
  .union([z.string(), z.undefined(), z.null()])
  .optional()
  .transform((v) => {
    if (v == null || v === "") return null;
    const s = String(v).trim();
    return s.length > 0 ? s : null;
  })
  .refine((v) => v === null || (typeof v === "string" && v.length > 0 && v.length <= 36), "Invalid tax rate.");

function buildProductSchema(taxRateRequired) {
  return z.object({
  title: z.string().min(1, "Title is required.").trim().max(255),
  slug: z.string().trim().max(255).optional().nullable(),
  description: z.string().trim().max(10000).optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null)),
  productTypeId: z.string().trim().max(36).optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null)),
  productCategoryId: z.string().trim().min(1, "Product category is required.").max(36),
  taxRateId: taxRateRequired ? taxRateIdRequired : taxRateIdOptional,
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
  weightUnit: z.enum(WEIGHT_UNIT_LIST).optional().nullable(),
  unitOfMeasure: z.enum(UNIT_OF_MEASURE_LIST, {
    required_error: "Unit of measure is required.",
    invalid_type_error: `Unit of measure must be one of: ${UNIT_OF_MEASURE_LIST.join(", ")}.`,
  }),
});
}

function validateProduct(body, slugValue, options = {}) {
  const taxRateRequired = Boolean(options.taxRateRequired);
  const parsed = buildProductSchema(taxRateRequired).safeParse(body);
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
      taxRateId: parsed.data.taxRateId,
      priceAmount: parsed.data.priceAmount,
      currency: undefined, // will be set server‑side to DEFAULT_CURRENCY
      quantity: parsed.data.quantity ?? 0,
      active: parsed.data.active ?? false,
      isPhysical: parsed.data.isPhysical ?? false,
      weight: parsed.data.weight,
      weightUnit: parsed.data.weightUnit,
      unitOfMeasure: parsed.data.unitOfMeasure,
    },
  };
}

module.exports = { validateProduct };
