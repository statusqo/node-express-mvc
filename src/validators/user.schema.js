const { z } = require("zod");

/** Admin create/update user. Password required on create, optional on update. */
const AdminUserCreateSchema = z.object({
  email: z.string().min(1, "Email is required.").trim().email("Invalid email address."),
  username: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((v) => v === undefined || v === null || v === "" || (v.length >= 3 && v.length <= 30), "Username must be 3–30 characters."),
  password: z.string().min(4, "Password must be at least 4 characters."),
  isAdmin: z.union([z.literal("on"), z.undefined()]).optional().transform((v) => v === "on"),
});

const AdminUserUpdateSchema = z.object({
  email: z.string().min(1, "Email is required.").trim().email("Invalid email address."),
  username: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((v) => v === undefined || v === null || v === "" || (v.length >= 3 && v.length <= 30), "Username must be 3–30 characters."),
  password: z
    .string()
    .optional()
    .refine((v) => v === undefined || v === "" || (v && v.length >= 4), "Password must be at least 4 characters if provided."),
  isAdmin: z.union([z.literal("on"), z.undefined()]).optional().transform((v) => v === "on"),
});

function validateAdminUserCreate(body) {
  const result = AdminUserCreateSchema.safeParse(body);
  if (!result.success) return { ok: false, errors: result.error.issues };
  const data = result.data;
  return {
    ok: true,
    data: {
      email: data.email.trim(),
      username: data.username && data.username.trim() ? data.username.trim() : null,
      password: data.password,
      isAdmin: data.isAdmin ?? false,
    },
  };
}

function validateAdminUserUpdate(body) {
  const result = AdminUserUpdateSchema.safeParse(body);
  if (!result.success) return { ok: false, errors: result.error.issues };
  const data = result.data;
  return {
    ok: true,
    data: {
      email: data.email.trim(),
      username: data.username && data.username.trim() ? data.username.trim() : null,
      password: data.password && data.password.trim() ? data.password : null,
      isAdmin: data.isAdmin ?? false,
    },
  };
}

module.exports = { validateAdminUserCreate, validateAdminUserUpdate };
