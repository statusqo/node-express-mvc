/**
 * Shared post-login logic: claim guest orders by email and redirect.
 * Same-origin returnTo only; default /account.
 * Used after local login and Google OAuth callback.
 */
const orderService = require("../services/order.service");
const logger = require("../config/logger");

/**
 * @param {object} req - Express request (must have req.user set)
 * @param {object} res - Express response
 * @param {string} [returnTo] - Optional redirect URL (validated same-origin)
 */
async function postLoginSuccess(req, res, returnTo) {
  const user = req.user;
  const userPlain = user && (typeof user.get === "function" ? user.get({ plain: true }) : user);
  if (userPlain?.email) {
    try {
      await orderService.claimGuestOrdersByEmail(userPlain.email, user.id);
    } catch (claimErr) {
      logger.warn("Claim guest orders on login failed", { userId: user.id, error: claimErr?.message });
    }
  }
  let redirectUrl = "/account";
  if (returnTo && typeof returnTo === "string") {
    try {
      const u = new URL(returnTo);
      const ourOrigin = (req.protocol || "http") + "://" + (req.get("host") || "");
      if (u.origin === ourOrigin) redirectUrl = returnTo;
    } catch (_) {}
  }
  res.redirect(redirectUrl);
}

module.exports = { postLoginSuccess };
