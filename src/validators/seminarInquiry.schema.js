const { z } = require("zod");

const SeminarInquirySchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email("Invalid email").max(120),
  message: z.string().min(10).max(2000),
  seminarSlug: z.string().min(1).max(120),
  website: z.string().optional(),
});

function validateSeminarInquiry(body) {
  const result = SeminarInquirySchema.safeParse(body);
  if (!result.success) return { ok: false, errors: result.error.issues };
  return { ok: true, data: result.data };
}

module.exports = { validateSeminarInquiry };
