const { z } = require("zod");

const slugSchema = z
  .string()
  .trim()
  .transform((s) => s.toLowerCase())
  .pipe(z.string().min(1, "Slug is required.").max(255).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only."));

const CollectionSchema = z.object({
  title: z.string().min(1, "Title is required.").trim().max(255),
  slug: z.string().trim().max(255).optional().nullable(),
  description: z.string().trim().max(5000).optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null)),
  active: z.union([z.literal("on"), z.undefined()]).optional().transform((v) => v === "on"),
});

function validateCollection(body, slugValue) {
  const parsed = CollectionSchema.safeParse(body);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues };
  const slugToCheck = slugValue || parsed.data.slug || "";
  const slugResult = slugSchema.safeParse(slugToCheck.toLowerCase());
  if (!slugResult.success) return { ok: false, errors: slugResult.error.issues };
  return {
    ok: true,
    data: {
      title: parsed.data.title.trim(),
      slug: slugResult.data,
      description: parsed.data.description,
      active: parsed.data.active ?? false,
    },
  };
}

module.exports = { validateCollection };
