const path = require("path");
const express = require("express");
const helmet = require("helmet");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const SequelizeStore = require("connect-session-sequelize")(session.Store);

const routes = require("./routes");
const { notFound } = require("./middlewares/notFound.middleware");
const { errorHandler } = require("./middlewares/error.middleware");
const { requestLogger } = require("./middlewares/requestLogger.middleware");
const { globalLimiter } = require("./middlewares/rateLimit.middleware");
const { csrfProtection } = require("./middlewares/csrf.middleware");
const { injectMenus } = require("./middlewares/menu.middleware");
const { injectCartDrawer } = require("./middlewares/cartDrawer.middleware");
const { flashMiddleware } = require("./middlewares/flash.middleware");
const { allowHost } = require("./middlewares/allowHost.middleware");
const { sequelize } = require("./db/client");
const config = require("./config");
const { DEFAULT_CURRENCY } = require("./config/constants");
const logger = require("./config/logger");
const passport = require("passport");

const app = express();

// When behind a reverse proxy (ngrok, load balancer), trust X-Forwarded-* so rate limit and IP-based logic use the real client IP.
app.set("trust proxy", 1);

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");

// security headers
const helmetOptions = {
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  hsts: {
    maxAge: 15552000,
    includeSubDomains: true,
    preload: true
  },
};
// CSP: disabled in development (avoids form-action / localhost quirks). Production uses full CSP.
if (config.env === "development") {
  helmetOptions.contentSecurityPolicy = false;
} else {
  helmetOptions.contentSecurityPolicy = {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://js.stripe.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https://accounts.google.com"],
      connectSrc: ["'self'", "https://api.stripe.com", "https://accounts.google.com"],
      frameSrc: ["https://js.stripe.com", "https://accounts.google.com"],
      formAction: ["'self'", "https://accounts.google.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
    },
  };
}
app.use(helmet(helmetOptions));

app.use(compression());
// app.use(requestLogger);

// Only accept requests whose Host is in the allowed list (protects redirect/CSRF use of Host)
app.use(allowHost);

// Stripe webhook route - must be before body parsing to receive raw body for signature verification
const stripeWebhookController = require("./controllers/web/stripe.controller");
const zoomWebhookController = require("./controllers/api/zoomWebhook.controller");
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res, next) => {
    try {
      await stripeWebhookController.webhook(req, res);
    } catch (err) {
      next(err);
    }
  }
);
app.post(
  "/api/zoom/webhook",
  express.raw({ type: "application/json" }),
  async (req, res, next) => {
    try {
      await zoomWebhookController.webhook(req, res);
    } catch (err) {
      next(err);
    }
  }
);

// body parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Session setup
const sessionStore = new SequelizeStore({
  db: sequelize,
  tableName: "sessions", // Optional: customize table name
});

// Create/Sync session table
if (config.db.dialect !== "none") {
  sessionStore.sync(); 
}

app.use(session({
  secret: config.auth.sessionSecret,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.env === "production", // requires https
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
    sameSite: "lax",
    // Set SESSION_COOKIE_DOMAIN only if cross-subdomain sharing is needed.
    // Leaving it empty (the default) restricts the cookie to the current host.
    domain: (config.env === "production" && config.sessionCookieDomain) ? config.sessionCookieDomain : undefined,
  }
}));

require("./config/passport");
app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  if (req.user) {
    const plain = typeof req.user.get === "function" ? req.user.get({ plain: true }) : req.user;
    res.locals.user = plain;
    res.locals.isAdmin = plain.isAdmin === true;
  }
  res.locals.googleAuthEnabled = !!(config.auth && config.auth.google && config.auth.google.clientID && config.auth.google.clientSecret);
  next();
});

app.use(flashMiddleware);

// make default currency available in all views
app.locals.DEFAULT_CURRENCY = DEFAULT_CURRENCY;

// inject dynamic menus and cart drawer data (before rate limit so 429 page has full layout)
app.use(injectMenus);
app.use(injectCartDrawer);

// global rate limiting
app.use(globalLimiter);

// csrf protection for state-changing requests
// Skip CSRF for Stripe and Zoom webhooks (they use signature verification / token validation)
app.use((req, res, next) => {
  if (req.path.startsWith("/api/stripe/webhook") || req.path.startsWith("/api/zoom/webhook")) {
    return next();
  }
  return csrfProtection(req, res, next);
});

// static assets
app.use("/public", express.static(path.join(__dirname, "public")));

// uploaded media (admin and web; same-origin at /uploads)
if (config.uploads && config.uploads.dir) {
  app.use(config.uploads.urlPath || "/uploads", express.static(config.uploads.dir));
}

// routes
const adminRouter = require("./routes/admin");

// Admin: path-based at /admin (same origin as main app)
app.use("/admin", adminRouter);

// Main App (web, api, auth)
app.use("/", routes);

// 404 + error
app.use(notFound);
app.use(errorHandler);

module.exports = app;
