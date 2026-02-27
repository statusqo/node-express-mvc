const { z } = require("zod");

const slugSchema = z
  .string()
  .trim()
  .transform((s) => s.toLowerCase())
  .pipe(z.string().min(1, "Slug is required.").max(255).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only."));

const PostSchema = z.object({
  title: z.string().min(1, "Title is required.").trim().max(500),
  slug: z.string().trim().max(255).optional().nullable(),
  excerpt: z.string().trim().max(2000).optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null)),
  body: z.string().trim().optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null)),
  published: z.union([z.literal("on"), z.undefined()]).optional().transform((v) => v === "on"),
  bodyIsHtml: z.union([z.literal("on"), z.undefined()]).optional().transform((v) => v === "on"),
});

function validatePost(body, slugValue) {
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues };
  const slugToCheck = slugValue ?? parsed.data.slug ?? "";
  const slugResult = slugSchema.safeParse(slugToCheck.toLowerCase());
  if (!slugResult.success) return { ok: false, errors: slugResult.error.issues };
  return {
    ok: true,
    data: {
      title: parsed.data.title.trim(),
      slug: slugResult.data,
      excerpt: parsed.data.excerpt,
      body: parsed.data.body,
      published: parsed.data.published ?? false,
      bodyIsHtml: parsed.data.bodyIsHtml ?? false,
    },
  };
}

module.exports = { validatePost };
