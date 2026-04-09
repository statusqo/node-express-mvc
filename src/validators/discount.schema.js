const { z } = require("zod");
const { DISCOUNT_TYPE_LIST, DISCOUNT_APPLIES_TO_LIST } = require("../constants/discount");

const AdminDiscountSchema = z
  .object({
    code: z
      .string({ required_error: "Code is required." })
      .trim()
      .min(3, "Code must be at least 3 characters.")
      .max(50, "Code must be at most 50 characters.")
      .regex(/^[A-Z0-9_-]+$/i, "Code may only contain letters, digits, hyphens, and underscores."),
    type: z.enum(DISCOUNT_TYPE_LIST, { errorMap: () => ({ message: "Invalid discount type." }) }),
    value: z.coerce
      .number({ required_error: "Value is required." })
      .positive("Value must be greater than zero."),
    minOrderAmount: z.union([z.coerce.number().nonnegative(), z.literal(""), z.null()]).optional().transform((v) => {
      if (v === "" || v == null) return null;
      return Number(v);
    }),
    maxUses: z.union([z.coerce.number().int().positive(), z.literal(""), z.null()]).optional().transform((v) => {
      if (v === "" || v == null) return null;
      return Number(v);
    }),
    validFrom: z
      .union([z.string().trim(), z.null()])
      .optional()
      .transform((v) => (v && v.trim() ? v.trim() : null)),
    validUntil: z
      .union([z.string().trim(), z.null()])
      .optional()
      .transform((v) => (v && v.trim() ? v.trim() : null)),
    applicableTo: z.enum(DISCOUNT_APPLIES_TO_LIST, {
      errorMap: () => ({ message: "Invalid applicableTo value." }),
    }).default("all"),
    active: z.union([z.boolean(), z.string(), z.number()]).transform((v) => {
      if (typeof v === "boolean") return v;
      if (v === "1" || v === "true" || v === "on") return true;
      return false;
    }),
    description: z
      .union([z.string().trim().max(1000), z.null()])
      .optional()
      .transform((v) => (v && String(v).trim() ? String(v).trim() : null)),
  })
  .superRefine((data, ctx) => {
    // Percentage discount must not exceed 100.
    if (data.type === "percentage" && data.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "Percentage discount cannot exceed 100%.",
      });
    }
    // validFrom < validUntil cross-field check.
    if (data.validFrom && data.validUntil) {
      if (new Date(data.validFrom) >= new Date(data.validUntil)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["validUntil"],
          message: "'Valid until' must be after 'Valid from'.",
        });
      }
    }
  });

const ApplyDiscountSchema = z.object({
  code: z.string().trim().min(1, "Code is required.").max(50),
  // Optional client-supplied cart total — sent by checkout.js using the displayed
  // summary (which accounts for attendee row counts). Falls back to server-side
  // cart total if omitted (e.g., direct API calls).
  cartTotal: z.coerce.number().nonnegative().optional(),
});

function validateDiscount(body) {
  const parsed = AdminDiscountSchema.safeParse(body);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues };
  return {
    ok: true,
    data: {
      ...parsed.data,
      code: String(parsed.data.code).trim().toUpperCase(),
    },
  };
}

function validateApplyDiscount(body) {
  const parsed = ApplyDiscountSchema.safeParse(body);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues };
  return { ok: true, data: { code: parsed.data.code, cartTotal: parsed.data.cartTotal ?? null } };
}

module.exports = { validateDiscount, validateApplyDiscount };
