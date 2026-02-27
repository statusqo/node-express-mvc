const { z } = require("zod");

const CheckoutSchema = z.object({
  forename: z.string().max(255).optional().nullable(),
  surname: z.string().max(255).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  mobile: z.string().max(50).optional().nullable(),
  deliveryLine1: z.string().max(255).optional().nullable(),
  deliveryLine2: z.string().max(255).optional().nullable(),
  deliveryCity: z.string().max(100).optional().nullable(),
  deliveryState: z.string().max(100).optional().nullable(),
  deliveryPostcode: z.string().max(20).optional().nullable(),
  deliveryCountry: z.string().max(100).optional().nullable(),
  billingLine1: z.string().max(255).optional().nullable(),
  billingLine2: z.string().max(255).optional().nullable(),
  billingCity: z.string().max(100).optional().nullable(),
  billingState: z.string().max(100).optional().nullable(),
  billingPostcode: z.string().max(20).optional().nullable(),
  billingCountry: z.string().max(100).optional().nullable(),
});

function validateCheckout(body) {
  const result = CheckoutSchema.safeParse(body);
  if (!result.success) return { ok: false, errors: result.error.issues };
  return { ok: true, data: result.data };
}

module.exports = { validateCheckout };
