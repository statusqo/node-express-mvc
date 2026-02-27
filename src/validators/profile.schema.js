const { z } = require("zod");

const ProfileSchema = z.object({
  forename: z.string().max(100).optional().nullable().transform((v) => (v === "" || v === undefined ? null : v)),
  surname: z.string().max(100).optional().nullable().transform((v) => (v === "" || v === undefined ? null : v)),
  mobile: z.string().max(30).optional().nullable().transform((v) => (v === "" || v === undefined ? null : v)),
});

function validateProfile(body) {
  const result = ProfileSchema.safeParse(body);
  if (!result.success) return { ok: false, errors: result.error.issues };
  return { ok: true, data: result.data };
}

module.exports = { validateProfile };
