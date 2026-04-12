// src/config/index.js
const path = require("path");
const { loadEnv, getEnv } = require("./env");
const { getAllowedHosts } = require("./allowedHosts");

loadEnv();

function bool(v) {
  return String(v).toLowerCase() === "true";
}

const config = {
  env: getEnv("NODE_ENV", "development"),
  port: Number(getEnv("PORT", "8080")),
  baseUrl: getEnv("BASE_URL", "http://localhost:8080"),
  allowedHosts: getAllowedHosts(),

  // Core template defaults to sqlite database.
  db: {
    dialect: getEnv("DB_DIALECT", "sqlite"), // sqlite | postgres | mysql
    storage: getEnv("DB_STORAGE", "data/database.sqlite"), // for sqlite
    url: getEnv("DATABASE_URL", ""), // for others
  },

  auth: {
    sessionSecret: getEnv("SESSION_SECRET", "change_me_in_production"),
    google: {
      clientID: getEnv("GOOGLE_CLIENT_ID", ""),
      clientSecret: getEnv("GOOGLE_CLIENT_SECRET", ""),
      callbackURL: getEnv("GOOGLE_CALLBACK_URL", "http://localhost:8080/auth/google/callback"),
    },
  },

  mail: {
    host: getEnv("SMTP_HOST", ""),
    port: Number(getEnv("SMTP_PORT", "587")),
    secure: bool(getEnv("SMTP_SECURE", "false")),
    user: getEnv("SMTP_USER", ""),
    pass: getEnv("SMTP_PASS", ""),
    from: getEnv("MAIL_FROM", "noreply@example.com"),
    to: getEnv("MAIL_TO", "admin@example.com"),
  },

  courses: {
    // Cancellation deadline: hours before course start date/time
    cancellationDeadlineHours: Number(getEnv("COURSE_CANCELLATION_DEADLINE_HOURS", "48")),
  },

  stripe: {
    secretKey: getEnv("STRIPE_SECRET_KEY", ""),
    publishableKey: getEnv("STRIPE_PUBLISHABLE_KEY", ""),
    webhookSecret: getEnv("STRIPE_WEBHOOK_SECRET", ""),
    // Pin API version for production stability; omit to use SDK default
    apiVersion: getEnv("STRIPE_API_VERSION", ""),
  },

  // Payment gateway: per-environment, default 'stripe'
  payment: {
    defaultGateway: getEnv("PAYMENT_DEFAULT_GATEWAY", "stripe"),
  },

  // Zoom (online events / webinars): OAuth app credentials
  zoom: {
    clientId: getEnv("ZOOM_CLIENT_ID", ""),
    clientSecret: getEnv("ZOOM_CLIENT_SECRET", ""),
    redirectUri: getEnv("ZOOM_REDIRECT_URI", ""),
    webhookSecret: getEnv("ZOOM_WEBHOOK_SECRET", ""),
    // Optional AES-256 key for encrypting OAuth tokens at rest (base64-encoded 32 bytes).
    // Generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
    tokenEncryptionKey: getEnv("ZOOM_TOKEN_ENCRYPTION_KEY", ""),
  },

  // Session cookie domain override (production only).
  // Leave empty to let the browser default to the current host (recommended for single-domain apps).
  sessionCookieDomain: getEnv("SESSION_COOKIE_DOMAIN", ""),

  // Uploaded media files (admin only)
  uploads: {
    dir: path.resolve(getEnv("UPLOAD_DIR", path.join(__dirname, "..", "..", "data", "uploads"))),
    urlPath: "/uploads",
    maxFileSizeBytes: Number(getEnv("UPLOAD_MAX_SIZE_BYTES", "20971520")), // 20 MB default
    allowedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/svg+xml",
      "application/pdf",
    ],
  },
};

module.exports = config;
