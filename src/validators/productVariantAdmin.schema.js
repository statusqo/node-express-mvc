const { z } = require("zod");

/** Schema for a single variant submitted via the product form (create or edit). */
const singleSubmittedVariantSchema = z.object({
  id: z
    .union([z.string().uuid(), z.literal(""), z.undefined(), z.null()])
    .optional()
    .transform((v) => (v == null || v === "" ? undefined : v)),
  title: z.string().trim().min(1, "Variant title is required.").max(255),
  priceAmount: z.coerce.number().refine((n) => !Number.isNaN(n) && n >= 0, "Variant price must be a number ≥ 0."),
  quantity: z
    .union([z.string(), z.number(), z.undefined(), z.null()])
    .optional()
    .transform((v) => {
      if (v === "" || v === undefined || v === null) return 0;
      const n = parseInt(String(v), 10);
      return Number.isFinite(n) && n >= 0 ? n : -1;
    })
    .refine((n) => n >= 0, "Variant quantity must be a non-negative integer."),
  sku: z
    .union([z.string(), z.undefined(), z.null()])
    .optional()
    .transform((v) => (v == null || String(v).trim() === "" ? null : String(v).trim()))
    .refine((v) => v === null || v.length <= 120, "Variant SKU is too long."),
  active: z
    .union([z.boolean(), z.literal("on"), z.literal("1"), z.literal("0"), z.undefined(), z.null()])
    .optional()
    .transform((v) => v === true || v === "on" || v === "1"),
});

/**
 * Parse and validate the variants array submitted from the product form.
 * Handles the case where body-parser gives an object with numeric keys instead of an array.
 * @param {*} rawVariants - req.body.variants
 * @returns {{ ok: true, data: Array } | { ok: false, error: string }}
 */
function parseAndValidateSubmittedVariants(rawVariants) {
  if (rawVariants == null) return { ok: true, data: [] };
  const arr = Array.isArray(rawVariants) ? rawVariants : Object.values(rawVariants);
  const results = [];
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (!v || typeof v !== "object") continue;
    const parsed = singleSubmittedVariantSchema.safeParse(v);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((issue) => issue.message).join(" ");
      return { ok: false, error: `Variant ${i + 1}: ${msg}` };
    }
    results.push(parsed.data);
  }
  return { ok: true, data: results };
}

module.exports = { parseAndValidateSubmittedVariants };
