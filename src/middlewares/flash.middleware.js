/**
 * Simple flash: one-time message for next render/redirect.
 * Use: res.setFlash("success", "Added to cart") then redirect; in template use flash.message and flash.type.
 * Production-safe: only allowed types (success, error, info); message coerced to string.
 */
const ALLOWED_FLASH_TYPES = new Set(["success", "error", "info"]);

function normalizeFlash(flash) {
  if (!flash || typeof flash !== "object") return null;
  const type = ALLOWED_FLASH_TYPES.has(flash.type) ? flash.type : "info";
  const message = flash.message != null ? String(flash.message) : "";
  return { type, message };
}

function flashMiddleware(req, res, next) {
  const raw = req.session.flash || null;
  req.session.flash = null;
  res.locals.flash = normalizeFlash(raw);

  res.setFlash = function (type, message) {
    if (!req.session) return;
    req.session.flash = {
      type: ALLOWED_FLASH_TYPES.has(type) ? type : "info",
      message: message != null ? String(message) : "",
    };
  };

  next();
}

module.exports = { flashMiddleware };
