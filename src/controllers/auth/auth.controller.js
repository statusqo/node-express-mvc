const passport = require("passport");
const accountService = require("../../services/account.service");
const { validateLogin, validateRegister } = require("../../validators/auth.schema");
const { postLoginSuccess } = require("../../utils/postLogin");
const logger = require("../../config/logger");

module.exports = {
  async showLogin(req, res) {
    if (req.user) {
      return res.redirect("/account");
    }
    res.render("web/login", {
      title: "Login",
      error: null,
      returnTo: req.query.returnTo || "",
    });
  },

  login(req, res, next) {
    const rawIdentifier = req.body.identifier || req.body.email || req.body.username;
    const identifier = typeof rawIdentifier === "string" ? rawIdentifier.trim() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const returnTo = req.body.returnTo || req.query.returnTo || "";

    const errMsg = validateLogin({ identifier, password });
    if (errMsg) {
      return res.status(400).render("web/login", { title: "Login", error: errMsg, returnTo });
    }

    passport.authenticate("local", (err, user, info) => {
      if (err) {
        logger.error("Passport local authenticate error", { error: err.message });
        return res.status(500).render("web/login", { title: "Login", error: "Login failed", returnTo });
      }
      if (!user) {
        const message = (info && info.message) ? info.message : "Invalid credentials.";
        return res.status(401).render("web/login", { title: "Login", error: message, returnTo });
      }
      req.session.regenerate((regErr) => {
        if (regErr) {
          logger.error("Session regenerate on login error", { error: regErr.message });
          return res.status(500).render("web/login", { title: "Login", error: "Login failed", returnTo });
        }
        req.login(user, (loginErr) => {
          if (loginErr) {
            logger.error("Passport req.login error", { error: loginErr.message });
            return res.status(500).render("web/login", { title: "Login", error: "Login failed", returnTo });
          }
          postLoginSuccess(req, res, returnTo).catch(next);
        });
      });
    })(req, res, next);
  },

  async showRegister(req, res) {
    if (req.user) {
      return res.redirect("/account");
    }
    res.render("web/register", {
      title: "Register",
      error: null,
    });
  },

  async register(req, res, next) {
    const { email, username, password } = req.body;

    const errMsg = validateRegister({ email, username, password });
    if (errMsg) {
      return res.status(400).render("web/register", { title: "Register", error: errMsg });
    }

    try {
      const user = await accountService.register({ email, username, password });
      req.session.regenerate((regErr) => {
        if (regErr) {
          logger.error("Session regenerate on register error", { error: regErr.message });
          return res.redirect("/auth/login");
        }
        req.login(user, (loginErr) => {
          if (loginErr) {
            logger.error("Passport req.login after register error", { error: loginErr.message });
            return res.redirect("/auth/login");
          }
          res.redirect("/account");
        });
      });
    } catch (err) {
      return res.status(400).render("web/register", { title: "Register", error: err.message });
    }
  },

  logout(req, res, next) {
    req.logout((err) => {
      if (err) {
        logger.error("Passport logout error", { error: err.message });
        return next(err);
      }
      req.session.destroy((destroyErr) => {
        if (destroyErr) logger.error("Session destroy on logout error", { error: destroyErr.message });
        res.clearCookie("connect.sid");
        res.redirect("/");
      });
    });
  },

  async googleCallback(req, res, next) {
    const returnTo = req.query.returnTo || (req.session && req.session.returnTo) || "";
    if (req.session && req.session.returnTo) delete req.session.returnTo;
    await postLoginSuccess(req, res, returnTo);
  },
};
