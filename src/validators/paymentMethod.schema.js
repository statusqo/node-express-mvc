const { z } = require("zod");

/** Add payment method (e.g. after Stripe confirmCardSetup). */
const AddPaymentMethodSchema = z.object({
  paymentMethodId: z.string().min(1, "Missing paymentMethodId.").trim().max(500),
  setAsDefault: z
    .union([z.literal("1"), z.literal("true"), z.boolean(), z.undefined()])
    .optional()
    .transform((v) => v === "1" || v === true || v === "true"),
});

function validateAddPaymentMethod(body) {
  const result = AddPaymentMethodSchema.safeParse(body);
  if (!result.success) return { ok: false, errors: result.error.issues };
  const data = result.data;
  return {
    ok: true,
    data: {
      paymentMethodId: data.paymentMethodId,
      setAsDefault: data.setAsDefault ?? false,
    },
  };
}

module.exports = { validateAddPaymentMethod };
