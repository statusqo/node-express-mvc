const { z } = require("zod");

/** Web form: register for an event session (webinar, seminar, classroom, etc.). */
const EventRegisterSchema = z.object({
  eventId: z.string().uuid("Please select a valid session."),
  email: z.string().email("Invalid email address.").max(255).optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null)),
  forename: z.string().trim().max(100).optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null)),
  surname: z.string().trim().max(100).optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null)),
  billingLine1: z.string().trim().max(255).optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null)),
  billingLine2: z.string().trim().max(255).optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null)),
  billingCity: z.string().trim().max(100).optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null)),
  billingState: z.string().trim().max(100).optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null)),
  billingPostcode: z.string().trim().max(20).optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null)),
  billingCountry: z.string().trim().max(100).optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null)),
});

function validateEventRegister(body) {
  const result = EventRegisterSchema.safeParse(body);
  if (!result.success) return { ok: false, errors: result.error.issues };
  const data = result.data;
  return {
    ok: true,
    data: {
      eventId: data.eventId,
      email: data.email,
      forename: data.forename,
      surname: data.surname,
      billingLine1: data.billingLine1,
      billingLine2: data.billingLine2,
      billingCity: data.billingCity,
      billingState: data.billingState,
      billingPostcode: data.billingPostcode,
      billingCountry: data.billingCountry,
    },
  };
}

module.exports = { validateEventRegister };
