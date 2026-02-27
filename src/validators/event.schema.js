const { z } = require("zod");

const EventFormSchema = z.object({
  startDate: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), "Start date must be a valid date.")
    .transform((v) => v && v.trim() ? v.trim() : null),
  startTime: z.string().trim().optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null)),
  durationMinutes: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v) => {
      if (v === "" || v === undefined || v === null) return null;
      const n = typeof v === "number" ? v : parseInt(String(v), 10);
      return Number.isNaN(n) ? null : n;
    })
    .refine((v) => v === null || (Number.isInteger(v) && v > 0), "Duration must be a positive integer (minutes)."),
  location: z.string().trim().max(255).optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null)),
  capacity: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v) => {
      if (v === "" || v === undefined || v === null) return null;
      const n = typeof v === "number" ? v : parseInt(String(v), 10);
      return Number.isNaN(n) ? null : n;
    })
    .refine((v) => v === null || (Number.isInteger(v) && v >= 0), "Capacity must be a non-negative integer."),
  isOnline: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => v === true || v === "true" || v === "1" || v === 1),
  priceAmount: z.union([z.string(), z.number()]).optional().transform((v) => (v === "" || v === undefined || v === null ? undefined : Number(v))),
  currency: z.string().trim().max(3).optional().transform((v) => (v && v.trim() ? v.trim().substring(0, 3) : undefined)),
  timezone: z.string().trim().max(64).optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null)),
});

function validateEventForm(body) {
  const result = EventFormSchema.safeParse(body);
  if (!result.success) return { ok: false, errors: result.error.issues };
  return { ok: true, data: result.data };
}

module.exports = { validateEventForm };
