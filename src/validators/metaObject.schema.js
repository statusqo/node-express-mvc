const { z } = require("zod");

/** Allowed attribute types for meta object definition. */
const META_OBJECT_ATTRIBUTE_TYPES = ["string", "text", "number", "date", "url", "email", "boolean"];

/**
 * Parse MetaObject.definition into array of { key, type, value }.
 * Handles array format [{key, type?, value}], legacy object format {key: value}, and legacy array [{key, value}].
 * Type defaults to "string" when missing for backward compatibility.
 * Accepts either a JSON string (TEXT column) or already-parsed object/array (JSON column).
 * @param {string|object|array|null|undefined} definition - JSON string or parsed value from MetaObject.definition
 * @returns {{ key: string, type: string, value: string }[]}
 */
function parseDefinitionPairs(definition) {
  try {
    const parsed = typeof definition === "string" ? JSON.parse(definition || "[]") : (definition ?? []);
    if (Array.isArray(parsed)) {
      return parsed.map((p) => {
        const key = p && typeof p === "object" && p.key ? String(p.key).trim() : "";
        const value = p && typeof p === "object" ? String(p.value ?? p.default ?? "").trim() : "";
        const type = p && typeof p === "object" && p.type && META_OBJECT_ATTRIBUTE_TYPES.includes(p.type)
          ? p.type
          : "string";
        return { key, type, value };
      }).filter((p) => p.key);
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.entries(parsed).map(([key, val]) => {
        const v = val && typeof val === "object" ? val : { value: val };
        const value = typeof v === "object" && v !== null ? String(v.value ?? v.default ?? "").trim() : String(val ?? "").trim();
        const type = typeof v === "object" && v !== null && v.type && META_OBJECT_ATTRIBUTE_TYPES.includes(v.type) ? v.type : "string";
        return { key: String(key).trim(), type, value };
      }).filter((p) => p.key);
    }
    return [];
  } catch {
    return [];
  }
}

const DefinitionPairSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, "All keys must be non-empty.")
    .regex(/^[a-zA-Z0-9_-]+$/, "Key must contain only letters, numbers, underscores, and hyphens.")
    .max(100, "Key must be at most 100 characters."),
  type: z
    .enum(META_OBJECT_ATTRIBUTE_TYPES)
    .optional()
    .default("string"),
  value: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ""))
    .pipe(z.string().max(500, "Value must be at most 500 characters.")),
});

const DefinitionPairsSchema = z
  .array(DefinitionPairSchema)
  .superRefine((pairs, ctx) => {
    const seen = new Set();
    pairs.forEach((p, i) => {
      if (seen.has(p.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Key '${p.key}' is defined more than once.`,
          path: [i],
        });
      }
      seen.add(p.key);
    });
  });

const DefinitionInputSchema = z
  .string()
  .optional()
  .default("[]")
  .transform((s) => {
    try {
      const parsed = JSON.parse(s || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })
  .pipe(DefinitionPairsSchema);

const MetaObjectSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(255),
  slug: z
    .string()
    .trim()
    .transform((s) => s.toLowerCase())
    .pipe(z.string().min(1, "Slug is required.").max(255).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens.")),
  type: z
    .string()
    .trim()
    .max(100)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() ? v.trim() : null)),
  definition: DefinitionInputSchema,
  active: z
    .union([z.literal("on"), z.undefined()])
    .optional()
    .transform((v) => v === "on"),
});

function validateMetaObject(body) {
  const result = MetaObjectSchema.safeParse(body);
  if (!result.success) {
    return { ok: false, errors: result.error.issues };
  }
  const data = result.data;
  const definitionJson = data.definition.length > 0
    ? JSON.stringify(data.definition.map((p) => ({ key: p.key, type: p.type || "string", value: p.value })))
    : null;
  return {
    ok: true,
    data: {
      name: data.name,
      slug: data.slug,
      type: data.type,
      definition: definitionJson,
      active: data.active,
    },
  };
}

/** Max length per meta object instance value (consistent with meta object definition values). */
const META_OBJECT_VALUE_MAX_LENGTH = 500;

const StringValueSchema = z
  .string()
  .transform((v) => String(v ?? "").trim().replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ""))
  .pipe(z.string().max(META_OBJECT_VALUE_MAX_LENGTH, `Value must be at most ${META_OBJECT_VALUE_MAX_LENGTH} characters.`));

const NumberValueSchema = z
  .string()
  .transform((v) => String(v ?? "").trim())
  .pipe(z.string().max(META_OBJECT_VALUE_MAX_LENGTH))
  .refine((v) => v === "" || !Number.isNaN(Number(v)), "Must be a valid number")
  .transform((v) => v);

const DateValueSchema = z
  .string()
  .transform((v) => String(v ?? "").trim())
  .refine((v) => v === "" || !Number.isNaN(Date.parse(v)), "Must be a valid date")
  .pipe(z.string().max(META_OBJECT_VALUE_MAX_LENGTH));

const UrlValueSchema = z
  .string()
  .transform((v) => String(v ?? "").trim().replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ""))
  .refine((v) => v === "" || /^https?:\/\/[^\s]+$/i.test(v), "Must be a valid URL")
  .pipe(z.string().max(META_OBJECT_VALUE_MAX_LENGTH));

const EmailValueSchema = z
  .string()
  .transform((v) => String(v ?? "").trim().replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ""))
  .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Must be a valid email address")
  .pipe(z.string().max(META_OBJECT_VALUE_MAX_LENGTH));

const BooleanValueSchema = z
  .string()
  .transform((v) => (v === "true" || v === "on" || v === "1" ? "true" : "false"));

/**
 * Get validator schema for a given attribute type.
 * @param {string} type - Attribute type (string, text, number, date, url, email, boolean)
 * @returns {z.ZodType<string>}
 */
function getValueSchemaForType(type) {
  switch (type) {
    case "number":
      return NumberValueSchema;
    case "date":
      return DateValueSchema;
    case "url":
      return UrlValueSchema;
    case "email":
      return EmailValueSchema;
    case "boolean":
      return BooleanValueSchema;
    case "string":
    case "text":
    default:
      return StringValueSchema;
  }
}

/**
 * Validate metaObjectValues: { [metaObjectId: string]: { [key: string]: string } }.
 * Keys must match allowedAttributes; values are validated by type.
 * @param {Record<string, Record<string, string>>} metaObjectValues - Raw values from form
 * @param {Record<string, Record<string, string>>} allowedAttributesByMetaObjectId - Map metaObjectId -> { key: type }
 * @returns {{ ok: boolean, data?: Record<string, Record<string, string>>, errors?: string[] }}
 */
function validateMetaObjectValues(metaObjectValues, allowedAttributesByMetaObjectId) {
  const errors = [];
  const result = {};

  if (!metaObjectValues || typeof metaObjectValues !== "object" || Array.isArray(metaObjectValues)) {
    return { ok: true, data: {} };
  }

  for (const [metaObjectId, vals] of Object.entries(metaObjectValues)) {
    if (!metaObjectId || typeof vals !== "object" || Array.isArray(vals)) continue;

    const allowedAttrs = allowedAttributesByMetaObjectId[metaObjectId] || {};
    const sanitized = {};

    for (const [key, value] of Object.entries(vals)) {
      const attrType = allowedAttrs[key];
      if (attrType === undefined) {
        errors.push(`Unknown key '${key}' for meta object ${metaObjectId}.`);
        continue;
      }
      const schema = getValueSchemaForType(attrType);
      const parsed = schema.safeParse(value);
      if (!parsed.success) {
        errors.push(`${key}: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
      } else {
        sanitized[key] = String(parsed.data);
      }
    }
    result[metaObjectId] = sanitized;
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, data: result };
}

module.exports = {
  validateMetaObject,
  DefinitionInputSchema,
  parseDefinitionPairs,
  validateMetaObjectValues,
  getValueSchemaForType,
  META_OBJECT_VALUE_MAX_LENGTH,
  META_OBJECT_ATTRIBUTE_TYPES,
};
