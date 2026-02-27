const { z } = require("zod");

const MenuItemSchema = z.object({
  menuId: z.string().trim().optional().nullable(),
  label: z.string().min(1, "Label is required.").trim().max(120),
  url: z.string().min(1, "URL is required.").trim().max(500),
  order: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === "" || v === undefined || v === null ? 0 : parseInt(String(v), 10) || 0))
    .refine((n) => Number.isInteger(n) && n >= 0, "Order must be a non-negative number."),
  parentId: z.string().trim().optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null)),
  icon: z.string().trim().max(60).optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null)),
  target: z.string().trim().max(20).optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null)),
  method: z.enum(["GET", "POST"]).optional().default("GET"),
  slug: z.string().trim().max(120).optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null)),
  active: z.union([z.literal("on"), z.undefined()]).optional().transform((v) => v === "on"),
});

function validateMenuItem(body) {
  const result = MenuItemSchema.safeParse(body);
  if (!result.success) return { ok: false, errors: result.error.issues };
  const data = result.data;
  return {
    ok: true,
    data: {
      menuId: data.menuId && data.menuId.trim() ? data.menuId.trim() : null,
      label: data.label.trim(),
      url: data.url.trim(),
      order: data.order,
      parentId: data.parentId,
      icon: data.icon,
      target: data.target,
      method: data.method === "POST" ? "POST" : "GET",
      slug: data.slug,
      active: data.active ?? false,
    },
  };
}

module.exports = { validateMenuItem };
