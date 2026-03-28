const { z } = require("zod");

const TaxRateSchema = z.object({
  name: z.string().min(1, "Name is required.").trim().max(255),
  stripeTaxRateId: z
    .string({ required_error: "Stripe Tax Rate ID is required." })
    .trim()
    .min(1, "Stripe Tax Rate ID is required.")
    .regex(/^txr_/, "Stripe Tax Rate ID must start with 'txr_'."),
  percentage: z
    .union([z.string(), z.number()])
    .transform((v) => parseInt(String(v), 10))
    .refine((n) => [0, 5, 13, 25].includes(n), "Percentage must be 0, 5, 13, or 25."),
});

function validateTaxRate(body) {
  const parsed = TaxRateSchema.safeParse(body);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues };
  return {
    ok: true,
    data: {
      name: parsed.data.name.trim(),
      stripeTaxRateId: parsed.data.stripeTaxRateId,
      percentage: parsed.data.percentage,
    },
  };
}

module.exports = { validateTaxRate };
