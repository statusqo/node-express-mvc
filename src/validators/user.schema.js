const { z } = require("zod");

const companyFields = {
  personType: z.enum(['private', 'legal']).optional().default('private'),
  companyName: z.string().max(255).optional().nullable(),
  companyOib: z.string().regex(/^\d{11}$/, "OIB must be exactly 11 digits").optional().nullable().or(z.literal('')),
};

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
  ...companyFields,
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
  ...companyFields,
});

function validateAdminUserCreate(body) {
  const result = AdminUserCreateSchema.safeParse(body);
  if (!result.success) return { ok: false, errors: result.error.issues };
  const data = result.data;
  const personType = data.personType === 'legal' ? 'legal' : 'private';
  return {
    ok: true,
    data: {
      email: data.email.trim(),
      username: data.username && data.username.trim() ? data.username.trim() : null,
      password: data.password,
      isAdmin: data.isAdmin ?? false,
      personType,
      companyName: personType === 'legal' ? (data.companyName || null) : null,
      companyOib: personType === 'legal' ? (data.companyOib || null) : null,
    },
  };
}

function validateAdminUserUpdate(body) {
  const result = AdminUserUpdateSchema.safeParse(body);
  if (!result.success) return { ok: false, errors: result.error.issues };
  const data = result.data;
  const personType = data.personType === 'legal' ? 'legal' : 'private';
  return {
    ok: true,
    data: {
      email: data.email.trim(),
      username: data.username && data.username.trim() ? data.username.trim() : null,
      password: data.password && data.password.trim() ? data.password : null,
      isAdmin: data.isAdmin ?? false,
      personType,
      companyName: personType === 'legal' ? (data.companyName || null) : null,
      companyOib: personType === 'legal' ? (data.companyOib || null) : null,
    },
  };
}

module.exports = { validateAdminUserCreate, validateAdminUserUpdate };
