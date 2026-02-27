# Authentication – Production Readiness

## 1. Flow: Routes → Controllers → Services → Repos → Models

| Layer | Auth-related files | Responsibility |
|-------|--------------------|----------------|
| **Routes** | `src/routes/auth/auth.routes.js`, `src/routes/web/account.routes.js`, `src/routes/admin/index.js` | Mount handlers; apply `requireWebAuth` / `requireAuth` where needed; apply `authLimiter` on login/register POST. |
| **Controllers** | `src/controllers/auth/auth.controller.js`, `src/controllers/web/account.controller.js`, admin controllers | Validate input; Passport authenticate / `req.login` / `req.logout`; session regenerate; post-login helper. |
| **Passport** | `src/config/passport.js` | Local strategy (identifier + password), Google OAuth 2.0; serialize/deserialize; deserialize uses `findByIdForAdmin`. |
| **Services** | `src/services/account.service.js` | Register (email, username, passwordHash); login credential check is in Passport Local strategy. |
| **Repos** | `src/repos/user.repo.js` | `findById`, `findByIdForAdmin`, `findByEmail`, `findByUsername`, `findByIdentifier`, `findByGoogleId`, `create`, `update`. |
| **Models** | `src/models/User.js` (User) | Schema: id, email, username, passwordHash, isAdmin, forename, surname, mobile, stripeCustomerId, googleId. |

Auth uses **Passport.js** (Local + optional Google OAuth). Session is managed by Passport; `req.session.regenerate()` is used on login/register to prevent session fixation.

---

## 2. Middleware Order and Placement

### App-level (in `app.js`)

1. **Session** – `express-session` with Sequelize store, `saveUninitialized: false`, `resave: false`, httpOnly cookie, secure in production.
2. **Passport** – `passport.initialize()`, `passport.session()`. Passport deserialize loads user by id via **`userRepo.findByIdForAdmin`** (excludes `passwordHash`) and sets `req.user`. If user not found, `done(null, null)` so `req.user` is unset.
3. **res.locals** – After Passport: if `req.user`, set `res.locals.user` (plain) and `res.locals.isAdmin`; set `res.locals.googleAuthEnabled` when Google OAuth is configured.
4. **Flash** – `flashMiddleware` (uses session).
5. **Rate limit** – `globalLimiter` (e.g. 300 req/15 min per IP).
6. **CSRF** – Same-origin check for non-GET; Stripe webhook path skipped.
7. **Routes** – Admin at `/admin`; main app at `/`.

### Route-level

- **Auth routes** (`/auth/*`): No `requireAuth` on login/register (they are public). `authLimiter` applied only to **POST** `/auth/login` and POST `/auth/register` to limit brute-force. Logout is POST only. GET `/auth/google` and `/auth/google/callback` are mounted only when Google OAuth is configured.
- **Web account** (`/account/*`): Every route uses **`requireWebAuth`** (redirect to `/auth/login` if no `req.user`).
- **Admin** (path-based `/admin`): Router uses **`requireAuth`** once for all admin routes. It checks `req.user` and `req.user.isAdmin` (redirect to `/` if not admin). Unauthenticated requests are redirected to `/auth/login?returnTo=<full URL>`.

### What each auth middleware does

- **requireAuth** – If no `req.user`: API → 401 JSON; admin subdomain → redirect to login with `returnTo`; else → redirect to `/auth/login`. If `req.user` and admin subdomain and not `isAdmin` → 403.
- **requireWebAuth** – If no `req.user` → redirect to `/auth/login`; else `next()`.
- **requireApiAuth** – If no `req.user` → 401 JSON; else `next()`.

Middleware is in the **correct place**: session and user attachment are global and run before routes; protection is applied at the router that needs it (account, admin); auth endpoints themselves are public but rate-limited.

---

## 3. Security Details

### Session and user loading

- **Session secret**: Must be set via `SESSION_SECRET` in production (long random value). Default in code is for development only; see `.env.example`.
- **User attached to request**: Passport **deserializeUser** uses only **`findByIdForAdmin`**, so `req.user` and `res.locals.user` never contain `passwordHash`.

### Login / register

- **Validation**: `auth.schema.js` (Zod) – login: identifier + password (min length); register: email, username (length), password (min length). Controllers call validators before Passport or account service.
- **Login (local)**: Passport Local strategy; verify via `userRepo.findByIdentifier` then `bcrypt.compare`. Same error message for invalid identifier or password. On success: `req.session.regenerate()`, then `req.login(user)`, then post-login (claim guest orders, same-origin redirect).
- **Login (Google)**: Optional; when configured, find/create user by `googleId`/email; session regenerate after OAuth; same post-login as local.
- **Register**: Transaction; check email/username uniqueness; bcrypt hash; create user; claim guest orders; then `req.session.regenerate()`, `req.login(user)`, redirect.
- **Session fixation**: On local login, after register, and after Google callback, `req.session.regenerate()` is used before `req.login()`.

### CSRF

- CSRF is enforced by **same-origin** check (origin/referer vs host) for non-GET requests in `csrf.middleware.js`. No double-submit cookie or token in forms; suitable for production as long as origin checks are correct and Stripe webhook is excluded.

### Orders and checkout

- **Orders** (`/orders`, `/orders/:id`): Intentionally **no** auth middleware; both guests (sessionId) and logged-in users (userId) can view their own orders. **Authorization is in the service layer**: `order.service` `getOrderById` / `getOrderWithLines` / `listOrders` filter by `userId` and `sessionId`, so one user/session cannot see another’s orders (404 if not found).
- **Checkout**: Same pattern – guest and logged-in; `userId`/`sessionId` passed through; no auth required on routes.

### Admin

- Admin is path-based (`/admin`). `requireAuth` ensures only logged-in users can access; then `req.user.isAdmin` is checked so only admins get through. Non-admins are redirected to `/`.

---

## 4. Production Checklist

- [x] Session user loaded with **`findByIdForAdmin`** (no `passwordHash` on `req.user` / `res.locals`).
- [x] **SESSION_SECRET** set in production (documented in `.env.example`).
- [x] **Auth rate limiting** on POST login and register (e.g. `authLimiter`); HTML requests get redirect + flash; API gets 429 JSON.
- [x] Login/register validated with Zod; same generic message for bad credentials.
- [x] Session regenerated on login (local and Google) and after register; then `req.login` so Passport writes to new session.
- [x] Logout: POST only; `req.logout()` then session destroyed; `connect.sid` cookie cleared.
- [x] Account and admin routes protected with `requireWebAuth` / `requireAuth`; admin also checks `isAdmin`.
- [x] Order/checkout authorization in service layer by `userId`/`sessionId`; no need for auth middleware on those routes.
- [ ] In production, ensure **cookie.secure** and **cookie.domain** match your domain and HTTPS.

---

## 5. File Reference

| Purpose | File |
|--------|------|
| Session + Passport + res.locals | `src/app.js` |
| Passport strategies (local, Google) + serialize/deserialize | `src/config/passport.js` |
| Auth middleware (requireAuth, requireWebAuth, requireApiAuth) | `src/middlewares/auth.middleware.js` |
| Auth rate limiter | `src/middlewares/rateLimit.middleware.js` |
| Auth routes (login, register, logout, Google OAuth when configured) | `src/routes/auth/auth.routes.js` |
| Auth controller | `src/controllers/auth/auth.controller.js` |
| Post-login helper (claim guest orders, redirect) | `src/utils/postLogin.js` |
| Login/register validation | `src/validators/auth.schema.js` |
| Account service (register; login logic in Passport Local) | `src/services/account.service.js` |
| User repo | `src/repos/user.repo.js` |
| User model | `src/models/User.js` |
| Account (protected) routes | `src/routes/web/account.routes.js` |
| Admin (protected) router | `src/routes/admin/index.js` |
