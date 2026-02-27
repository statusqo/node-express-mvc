/**
 * Passport.js configuration: Local (username/email + password) and Google OAuth 2.0.
 * - Local strategy uses same credential checks as before (no user enumeration).
 * - Deserialize never exposes passwordHash; uses findByIdForAdmin only.
 */
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const bcrypt = require("bcrypt");
const userRepo = require("../repos/user.repo");
const config = require("./index");
const logger = require("./logger");

// --- Local strategy: identifier (username or email) + password ---
passport.use(
  new LocalStrategy(
    {
      usernameField: "identifier",
      passwordField: "password",
      passReqToCallback: false,
    },
    async (identifier, password, done) => {
      try {
        const trimmed = typeof identifier === "string" ? identifier.trim() : "";
        if (!trimmed || typeof password !== "string") {
          return done(null, false, { message: "Invalid credentials." });
        }
        const user = await userRepo.findByIdentifier(trimmed);
        if (!user) {
          return done(null, false, { message: "Invalid credentials." });
        }
        if (!user.passwordHash) {
          return done(null, false, { message: "Invalid credentials." });
        }
        const match = await bcrypt.compare(password, user.passwordHash);
        if (!match) {
          return done(null, false, { message: "Invalid credentials." });
        }
        // Return user instance; serializer will store user.id only
        return done(null, user);
      } catch (err) {
        logger.error("Passport local strategy error", { error: err.message });
        return done(err);
      }
    }
  )
);

// --- Google OAuth 2.0 strategy ---
const googleConfig = config.auth && config.auth.google;
if (googleConfig && googleConfig.clientID && googleConfig.clientSecret) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: googleConfig.clientID,
        clientSecret: googleConfig.clientSecret,
        callbackURL: googleConfig.callbackURL,
        scope: ["profile", "email"],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const googleId = profile.id;
          const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
          if (!email) {
            return done(new Error("Google did not provide an email."));
          }
          const emailLower = String(email).toLowerCase();
          const givenName = profile.name?.givenName ?? profile._json?.given_name ?? null;
          const familyName = profile.name?.familyName ?? profile._json?.family_name ?? null;

          let user = await userRepo.findByGoogleId(googleId);
          if (user) {
            return done(null, user);
          }
          user = await userRepo.findByEmail(emailLower);
          if (user) {
            if (!user.googleId) {
              await userRepo.update(user.id, { googleId });
            }
            const safeUser = await userRepo.findByIdForAdmin(user.id);
            return done(null, safeUser);
          }
          user = await userRepo.create({
            email: emailLower,
            username: null,
            passwordHash: null,
            googleId,
            forename: givenName ? String(givenName).trim() : null,
            surname: familyName ? String(familyName).trim() : null,
          });
          return done(null, user);
        } catch (err) {
          logger.error("Passport Google strategy error", { error: err.message });
          return done(err);
        }
      }
    )
  );
} else {
  logger.warn("Google OAuth not configured (missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET). Sign in with Google will be disabled.");
}

// --- Serialize: store only user id in session ---
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// --- Deserialize: load user by id, never expose passwordHash ---
passport.deserializeUser(async (id, done) => {
  try {
    const user = await userRepo.findByIdForAdmin(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

module.exports = passport;
