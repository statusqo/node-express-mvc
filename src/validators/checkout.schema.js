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
  attendees: z.string().optional().nullable(),
});

function validateCheckout(body) {
  const result = CheckoutSchema.safeParse(body);
  if (!result.success) return { ok: false, errors: result.error.issues };
  const data = result.data;
  let attendees = [];
  if (data.attendees && String(data.attendees).trim()) {
    try {
      const parsed = JSON.parse(String(data.attendees));
      if (Array.isArray(parsed)) {
        attendees = parsed
          .map((entry) => ({
            productVariantId: entry && entry.productVariantId ? String(entry.productVariantId).trim() : "",
            attendees: Array.isArray(entry && entry.attendees)
              ? entry.attendees.map((a) => ({
                email: a && a.email ? String(a.email).trim().toLowerCase() : "",
                forename: a && a.forename ? String(a.forename).trim() : null,
                surname: a && a.surname ? String(a.surname).trim() : null,
              }))
              : [],
          }))
          .filter((entry) => entry.productVariantId);
      }
    } catch (_) {
      return { ok: false, errors: [{ message: "Invalid attendees payload." }] };
    }
  }
  return { ok: true, data: { ...data, attendees } };
}

module.exports = { validateCheckout };
