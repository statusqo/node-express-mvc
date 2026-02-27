const { z } = require("zod");

// Login: email OR username
const LoginSchema = z.object({
  identifier: z.string().min(1, "Username or Email is required"),
  password: z.string().min(4, "Password must be at least 4 characters")
});

// Register: email AND username
const RegisterSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(30, "Username too long"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(4, "Password must be at least 4 characters")
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
