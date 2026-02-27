const { z } = require("zod");

const MenuSchema = z.object({
  slug: z
    .string()
    .min(1, "Slug is required.")
    .trim()
    .transform((s) => s.toLowerCase())
    .pipe(z.string().max(255).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only.")),
  name: z.string().min(1, "Name is required.").trim().max(255),
  description: z.string().trim().max(2000).optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null)),
  active: z.union([z.literal("on"), z.undefined()]).optional().transform((v) => v === "on"),
  order: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === "" || v === undefined || v === null ? 0 : parseInt(String(v), 10) || 0))
    .refine((n) => Number.isInteger(n) && n >= 0, "Order must be a non-negative integer."),
});

function validateMenu(body) {
  const result = MenuSchema.safeParse(body);
  if (!result.success) return { ok: false, errors: result.error.issues };
  const data = result.data;
  return {
    ok: true,
    data: {
      slug: data.slug,
      name: data.name.trim(),
      description: data.description,
      active: data.active ?? false,
      order: data.order,
    },
  };
}

module.exports = { validateMenu };
