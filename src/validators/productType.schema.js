const { z } = require("zod");

const ProductTypeSchema = z.object({
  name: z.string().min(1, "Name is required.").trim().max(255),
  slug: z
    .string()
    .min(1, "Slug is required.")
    .trim()
    .transform((s) => s.toLowerCase())
    .pipe(z.string().max(255).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only.")),
});

function validateProductType(body, slugValue) {
  const parsed = z.object({ name: z.string().trim().max(255), slug: z.string().trim().max(255).optional() }).safeParse(body);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues };
  const slugToCheck = slugValue ?? parsed.data.slug ?? "";
  const slugResult = z
    .string()
    .min(1, "Slug is required.")
    .transform((s) => s.toLowerCase())
    .pipe(z.string().regex(/^[a-z0-9-]+$/))
    .safeParse(slugToCheck);
  if (!slugResult.success) return { ok: false, errors: slugResult.error.issues };
  if (!parsed.data.name || !parsed.data.name.trim()) return { ok: false, errors: [{ message: "Name is required.", path: ["name"] }] };
  return {
    ok: true,
    data: { name: parsed.data.name.trim(), slug: slugResult.data },
  };
}

module.exports = { validateProductType };
