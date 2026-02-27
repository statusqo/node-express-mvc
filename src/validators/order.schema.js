const { z } = require("zod");
const { FULFILLMENT_STATUSES } = require("../constants/order");

const OrderUpdateSchema = z.object({
  fulfillmentStatus: z
    .string()
    .trim()
    .min(1, "Fulfillment status is required.")
    .transform((s) => s.toLowerCase())
    .refine((s) => FULFILLMENT_STATUSES.includes(s), "Invalid fulfillment status."),
});

function validateOrderUpdate(body) {
  const result = OrderUpdateSchema.safeParse(body);
  if (!result.success) return { ok: false, errors: result.error.issues };
  return { ok: true, data: { fulfillmentStatus: result.data.fulfillmentStatus } };
}

module.exports = { validateOrderUpdate };
