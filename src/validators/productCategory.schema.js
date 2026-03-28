const { z } = require("zod");

const slugSchema = z
  .string()
  .trim()
  .transform((s) => s.toLowerCase())
  .pipe(
    z
      .string()
      .min(1, "Slug is required.")
      .max(255)
      .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only.")
  );

const ProductCategorySchema = z.object({
  name: z.string().min(1, "Name is required.").trim().max(255),
  slug: z.string().trim().max(255).optional().nullable(),
  kpdCode: z
    .string({ required_error: "KPD code is required." })
    .trim()
    .min(1, "KPD code is required.")
    .max(20)
    .regex(/^\d{2}(\.\d{2}){0,3}$/, "KPD code must be in NKD format (e.g. 62.01.11)."),
});

function validateProductCategory(body, slugValue) {
  const parsed = ProductCategorySchema.safeParse(body);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues };
  const slugToCheck = slugValue ?? parsed.data.slug ?? "";
  const slugResult = slugSchema.safeParse(slugToCheck.toLowerCase());
  if (!slugResult.success) return { ok: false, errors: slugResult.error.issues };
  return {
    ok: true,
    data: {
      name: parsed.data.name.trim(),
      slug: slugResult.data,
      kpdCode: parsed.data.kpdCode,
    },
  };
}

module.exports = { validateProductCategory };
