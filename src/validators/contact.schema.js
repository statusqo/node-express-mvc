const { z } = require("zod");

const ContactSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email("Invalid email").max(120),
  message: z.string().min(10).max(2000),
  website: z.string().optional() // honeypot
});

function validateContact(body) {
  const result = ContactSchema.safeParse(body);
  if (!result.success) return { ok: false, errors: result.error.issues };
  return { ok: true, data: result.data };
}

module.exports = { validateContact };
