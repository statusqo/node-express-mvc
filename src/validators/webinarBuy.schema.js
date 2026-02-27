const { z } = require("zod");

/** Web form: book a webinar session (guest or logged-in). */
const WebinarBuySchema = z.object({
  eventId: z.string().uuid("Please select a valid session."),
  email: z.string().email("Invalid email address.").max(255).optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null)),
  forename: z.string().trim().max(100).optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null)),
  surname: z.string().trim().max(100).optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null)),
});

function validateWebinarBuy(body) {
  const result = WebinarBuySchema.safeParse(body);
  if (!result.success) return { ok: false, errors: result.error.issues };
  const data = result.data;
  return { ok: true, data: { eventId: data.eventId, email: data.email, forename: data.forename, surname: data.surname } };
}

module.exports = { validateWebinarBuy };
