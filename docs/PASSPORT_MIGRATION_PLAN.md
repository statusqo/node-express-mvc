# Passport.js Migration Plan

**Last synced with codebase:** Paths, line numbers, and view names verified against current `app.js`, auth controller, routes, views, config, and `src/db/migrations/` (Feb 2025).

## Overview

This document outlines a step-by-step plan to replace the custom authentication logic with **Passport.js**, supporting:

1. **Local strategy**: Login with `usernameOrEmail` + `password`
2. **Google OAuth 2.0**: Sign in with Google

---

## Current State Summary

| Component | Current Implementation |
|-----------|------------------------|
| **Session** | `express-session` + `connect-session-sequelize` (Sequelize store) |
| **Auth flow** | Controller → `account.service.login()` → `userRepo.findByIdentifier()` → bcrypt compare |
| **Session storage** | `req.session.userId` set manually after login |
| **User attachment** | Custom middleware: if `req.session.userId`, load user via `userService.getUserById` (uses `userRepo.findByIdForAdmin`), set `req.user` and `res.locals.user` |
| **Auth middleware** | `requireAuth`, `requireWebAuth`, `requireApiAuth` — check `req.user` |
| **User model** | `User` with `email`, `username`, `passwordHash` (nullable), `isAdmin`, etc. |

---

## Dependencies to Add

```bash
npm install passport passport-local passport-google-oauth20
```

- **passport** — authentication middleware
- **passport-local** — username/password strategy
- **passport-google-oauth20** — Google OAuth 2.0 strategy

---

## Phase 1: Prepare Database & Config

### Step 1.1 — Add OAuth fields to User model

OAuth users may not have a password. Add fields to link Google accounts:

| Field | Type | Purpose |
|-------|------|---------|
| `googleId` | `STRING` (nullable, unique) | Google user ID for OAuth lookup |
| `passwordHash` | Already nullable | OAuth users have no password |

**Migration file**: Create `src/db/migrations/YYYYMMDDHHMMSS-add-google-oauth-fields.js` to add `googleId` column with unique index (match existing migration naming: e.g. `20260222100001-add-google-oauth-fields.js`).

### Step 1.2 — Add Google OAuth config

Add to `config/index.js`:

```javascript
auth: {
  sessionSecret: getEnv("SESSION_SECRET", "change_me_in_production"),
  google: {
    clientID: getEnv("GOOGLE_CLIENT_ID", ""),
    clientSecret: getEnv("GOOGLE_CLIENT_SECRET", ""),
    callbackURL: getEnv("GOOGLE_CALLBACK_URL", "http://localhost:8080/auth/google/callback"),
  },
},
```

**Environment variables** (`.env`):

- `GOOGLE_CLIENT_ID` — from Google Cloud Console
- `GOOGLE_CLIENT_SECRET` — from Google Cloud Console
- `GOOGLE_CALLBACK_URL` — e.g. `http://localhost:8080/auth/google/callback` (dev) or `https://yourdomain.com/auth/google/callback` (prod)

---

## Phase 2: Passport Setup & Strategies

### Step 2.1 — Create Passport config module

Create `src/config/passport.js`:

1. **Initialize Passport** and configure **Local Strategy**:
   - Use `usernameField: 'identifier'` to accept `usernameOrEmail`
   - Verify password via `userRepo.findByIdentifier()` + bcrypt compare (reuse logic from `account.service.login`)
   - Passport expects `done(null, user)` or `done(null, false, { message })`

2. **Configure Google OAuth Strategy**:
   - Use `passport-google-oauth20` with `Strategy`
   - `clientID`, `clientSecret`, `callbackURL` from config
   - `scope: ['profile', 'email']` to get email
   - In verify callback: find or create user by `profile.id` (googleId) or `profile.emails[0].value` (email)
   - For new users: create with `googleId`, `email`, `forename`/`surname` from profile, `passwordHash: null`
   - For existing users who linked Google: update `googleId` if missing

3. **Serialize user**: `passport.serializeUser((user, done) => done(null, user.id))`

4. **Deserialize user**: `passport.deserializeUser(async (id, done) => { ... })` — load user via `userRepo.findByIdForAdmin(id)`, exclude `passwordHash`, call `done(null, user)` or `done(err)`

---

## Phase 3: App Integration

### Step 3.1 — Initialize Passport in `app.js`

**Order matters.** Insert after `express-session` and before the custom "Attach User" middleware:

```javascript
// After session middleware
const passport = require('passport');
require('./config/passport'); // Load strategies

app.use(passport.initialize());
app.use(passport.session());
```

**Remove** the custom "Attach User" middleware (currently **lines 109–129** in `app.js`). Passport’s `passport.session()` + `deserializeUser` will set `req.user` instead.

**Update** any code that sets `res.locals.user` and `res.locals.isAdmin` — add a small middleware after `passport.session()`:

```javascript
app.use((req, res, next) => {
  if (req.user) {
    const plain = typeof req.user.get === 'function' ? req.user.get({ plain: true }) : req.user;
    res.locals.user = plain;
    res.locals.isAdmin = plain.isAdmin === true;
  }
  next();
});
```

### Step 3.2 — Session compatibility

Passport stores the serialized user in `req.session.passport.user` (default). Your existing session store and cookie config remain unchanged. Passport uses `express-session` under the hood.

---

## Phase 4: Auth Controller Refactor

### Step 4.1 — Local login (POST /auth/login)

**Replace** manual `accountService.login` + `req.session.regenerate` + `req.session.userId` with:

```javascript
passport.authenticate('local', {
  failureRedirect: '/auth/login',
  failureFlash: true,  // optional: if using connect-flash
  session: true
})(req, res, (err) => {
  if (err) return res.status(500).render('web/login', { title: 'Login', error: 'Login failed', returnTo: req.body?.returnTo || '' });
  // Success: run post-login logic (claim guest orders, redirect)
});
```

Or use a custom callback to handle `claimGuestOrdersByEmail` and redirect logic (returnTo, admin subdomain, /account).

**Keep**:
- Input validation (`validateLogin`) before calling Passport
- `authLimiter` on the route
- Redirect logic (returnTo, admin subdomain, /account)

### Step 4.2 — Register (unchanged flow, optional Passport)

Registration can stay as-is: `accountService.register` + manual `req.session.regenerate` + `req.session.userId`. After register, you can either:
- **Option A**: Keep manual session and call `req.login(user, (err) => { ... })` so Passport picks up the session
- **Option B**: Redirect to login and let user sign in

**Recommended**: After register, use `req.login(user, ...)` so Passport serializes the user and session stays consistent.

### Step 4.3 — Logout

**Replace** manual `req.session.destroy` with:

```javascript
req.logout((err) => {
  if (err) return next(err);
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});
```

`req.logout` is provided by Passport and clears `req.user`.

### Step 4.4 — Google OAuth routes

Add to `auth.routes.js`:

```javascript
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/auth/login',
    session: true
  }),
  (req, res) => {
    // Sync as local login: claim guest orders, handle returnTo, admin, /account
    // ...
  }
);
```

Implement the same post-login logic (claim guest orders, redirect) in the callback.

---

## Phase 5: User Repo & Service Updates

### Step 5.1 — User repo

Add to `user.repo.js`:

- `findByGoogleId(googleId)` — for OAuth lookup
- Ensure `findByIdentifier` remains for Local strategy

### Step 5.2 — Account service

- **Login**: Local strategy will call its own verify function. You can extract the bcrypt + `findByIdentifier` logic into a shared helper used by both `account.service` (e.g. for admin-created users) and the Passport Local strategy.
- **Register**: Keep as-is. Optional: add `linkGoogleAccount(userId, googleId)` for users who later connect Google.

---

## Phase 6: Auth Middleware

### Step 6.1 — `requireAuth`, `requireWebAuth`, `requireApiAuth`

No changes needed. They already check `req.user`, which Passport will populate. Ensure `passport.session()` runs before these middlewares.

---

## Phase 7: Login & Register UI

### Step 7.1 — Login page

Add a "Sign in with Google" button:

```pug
a(href="/auth/google") Sign in with Google
```

Place it above or below the local login form. Optionally style it as a Google-style button.

### Step 7.2 — Register page

Optional: add "Sign up with Google" that redirects to `/auth/google`. First-time Google users can be auto-created in the OAuth verify callback.

---

## Phase 8: CSP & Security (Production)

### Step 8.1 — Content Security Policy

If using CSP, add Google’s domains for OAuth redirects:

- `connect-src`: `https://accounts.google.com`
- `frame-src`: `https://accounts.google.com` (if using popup/iframe)
- `form-action`: allow redirect to Google if needed

### Step 8.2 — Cookie & session

- Keep `sameSite: 'lax'` for OAuth (required for redirect flow)
- Ensure `secure: true` in production

---

## Phase 9: Claim Guest Orders

Your existing `claimGuestOrdersByEmail` logic runs after successful login. Ensure it runs in:

1. Local login success handler (custom Passport callback)
2. Google OAuth callback handler

Pass both through a shared helper, e.g. `postLoginSuccess(req, res, user)`.

---

## Phase 10: Testing & Rollback

### Step 10.1 — Test checklist

- [ ] Local login with username
- [ ] Local login with email
- [ ] Local login with invalid credentials
- [ ] Register → auto login
- [ ] Logout
- [ ] Google OAuth first-time user (create account)
- [ ] Google OAuth existing user (sign in)
- [ ] Google OAuth with existing email (link or merge)
- [ ] Admin area login + returnTo redirect (app uses path-based `/admin`, not subdomain)
- [ ] Claim guest orders on login
- [ ] Protected routes (requireAuth, requireWebAuth, requireApiAuth)
- [ ] Session persistence across requests

### Step 10.2 — Rollback

If issues arise, you can revert by:

1. Restoring the custom "Attach User" middleware
2. Restoring manual session handling in the auth controller
3. Removing Passport middleware and strategies
4. Reverting route changes

Keep the migration in a feature branch until fully validated.

---

## File Change Summary

| File | Action |
|------|--------|
| `package.json` | Add `passport`, `passport-local`, `passport-google-oauth20` |
| `src/config/index.js` | Add `auth.google` config |
| `src/config/passport.js` | **Create** — Local + Google strategies, serialize/deserialize |
| `src/models/User.js` | Add `googleId` field (or via migration) |
| `src/db/migrations/` | **Create** — Add `googleId` column (e.g. `YYYYMMDDHHMMSS-add-google-oauth-fields.js`) |
| `src/app.js` | Add Passport init + session; replace "Attach User" (lines 109–129) with Passport + res.locals |
| `src/controllers/auth/auth.controller.js` | Refactor login, logout; add Google callback handler |
| `src/routes/auth/auth.routes.js` | Add GET `/auth/google`, GET `/auth/google/callback` |
| `src/repos/user.repo.js` | Add `findByGoogleId`, optionally `findOrCreateByGoogleProfile` |
| `src/views/web/login.pug` | Add "Sign in with Google" button |
| `src/views/web/register.pug` | Optional: add "Sign up with Google" |
| `src/services/account.service.js` | Minor: extract verify logic for reuse if desired |
| `docs/AUTH_PRODUCTION_READINESS.md` | Update to reflect Passport flow |

---

## Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project or select existing
3. Enable **Google+ API** / **Google Identity Services** (or "Credentials" → OAuth 2.0)
4. Create **OAuth 2.0 Client ID** (Web application)
5. Add **Authorized redirect URIs**: `http://localhost:8080/auth/google/callback` (dev), `https://yourdomain.com/auth/google/callback` (prod)
6. Copy Client ID and Client Secret into `.env`

---

## Estimated Effort

| Phase | Estimated time |
|-------|----------------|
| Phase 1 (DB & config) | 30 min |
| Phase 2 (Passport strategies) | 1–2 hours |
| Phase 3 (App integration) | 30 min |
| Phase 4 (Controller refactor) | 1 hour |
| Phase 5 (Repo & service) | 30 min |
| Phase 6 (Middleware) | 5 min |
| Phase 7 (UI) | 15 min |
| Phase 8 (CSP) | 15 min |
| Phase 9 (Guest orders) | 30 min |
| Phase 10 (Testing) | 1–2 hours |

**Total**: ~6–8 hours

---

## Next Steps

1. Create a feature branch for the migration
2. Run Phase 1 (migration + config)
3. Implement Phase 2 (Passport config)
4. Integrate Phase 3–4 (app + controller)
5. Add Google routes and UI
6. Test thoroughly
7. Update documentation
