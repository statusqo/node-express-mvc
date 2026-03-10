const { z } = require("zod");

// Login: email OR username
const LoginSchema = z.object({
  identifier: z.string().min(1, "Username or Email is required"),
  password: z.string().min(4, "Password must be at least 4 characters")
});

// Register: email AND username, with optional company fields for legal persons
const RegisterSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(30, "Username too long"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(4, "Password must be at least 4 characters"),
  personType: z.enum(['private', 'legal']).default('private'),
  companyName: z.string().max(255).optional(),
  companyOib: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().regex(/^\d{11}$/, "OIB must be exactly 11 digits").optional()
  ),
}).superRefine((data, ctx) => {
  if (data.personType === 'legal') {
    if (!data.companyName || data.companyName.trim() === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['companyName'], message: "Company name is required for legal persons" });
    }
    if (!data.companyOib) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['companyOib'], message: "OIB is required for legal persons" });
    }
  }
});

function validateLogin(data) {
  const result = LoginSchema.safeParse(data);
  if (!result.success) {
    return result.error.issues[0].message;
  }
  return null;
}

function validateRegister(data) {
  const result = RegisterSchema.safeParse(data);
  if (!result.success) {
    return result.error.issues[0].message;
  }
  return null;
}

module.exports = { validateLogin, validateRegister };
