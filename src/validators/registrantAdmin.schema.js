const { z } = require("zod");

const RegistrantAdminUpdateSchema = z.object({
  email: z.string().min(1, "Email is required.").trim().email("Enter a valid email.").max(255),
  forename: z.preprocess(
    (v) => (v === undefined || v === null ? "" : String(v)),
    z
      .string()
      .trim()
      .max(100)
      .transform((s) => (s.length ? s : null))
  ),
  surname: z.preprocess(
    (v) => (v === undefined || v === null ? "" : String(v)),
    z
      .string()
      .trim()
      .max(100)
      .transform((s) => (s.length ? s : null))
  ),
});

function validateRegistrantAdminUpdate(body) {
  const result = RegistrantAdminUpdateSchema.safeParse(body || {});
  if (!result.success) return { ok: false, errors: result.error.issues };
  return { ok: true, data: result.data };
}

module.exports = { validateRegistrantAdminUpdate };
