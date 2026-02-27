const { z } = require("zod");

const AddressSchema = z.object({
  label: z.string().max(60).optional(),
  line1: z.string().min(1, "Address line 1 is required").max(120),
  line2: z.string().max(120).optional(),
  city: z.string().min(1, "City is required").max(80),
  state: z.string().max(80).optional(),
  postcode: z.string().min(1, "Postcode is required").max(20),
  country: z.string().min(1, "Country is required").max(80),
  isDefault: z.coerce.boolean().optional().default(false),
});

function validateAddress(body) {
  const result = AddressSchema.safeParse(body);
  if (!result.success) return { ok: false, errors: result.error.issues };
  return { ok: true, data: result.data };
}

const ProfileAddressesSchema = z.object({
  deliveryLine1: z.string().min(1, "Delivery line 1 is required").max(120),
  deliveryLine2: z.string().max(120).optional().nullable(),
  deliveryCity: z.string().min(1, "Delivery city is required").max(80),
  deliveryState: z.string().max(80).optional().nullable(),
  deliveryPostcode: z.string().min(1, "Delivery postcode is required").max(20),
  deliveryCountry: z.string().min(1, "Delivery country is required").max(80),
  sameAsDelivery: z.coerce.boolean().optional().default(false),
  billingLine1: z.string().min(1).max(120).optional().nullable(),
  billingLine2: z.string().max(120).optional().nullable(),
  billingCity: z.string().min(1).max(80).optional().nullable(),
  billingState: z.string().max(80).optional().nullable(),
  billingPostcode: z.string().min(1).max(20).optional().nullable(),
  billingCountry: z.string().min(1).max(80).optional().nullable(),
}).refine(
  (data) => {
    if (!data.sameAsDelivery) {
      return data.billingLine1 && data.billingCity && data.billingPostcode && data.billingCountry;
    }
    return true;
  },
  { message: "Billing address is required when not same as delivery.", path: ["billingLine1"] }
);

function validateProfileAddresses(body) {
  const result = ProfileAddressesSchema.safeParse(body);
  if (!result.success) return { ok: false, errors: result.error.issues };
  return { ok: true, data: result.data };
}

module.exports = { validateAddress, validateProfileAddresses };
