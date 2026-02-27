// src/controllers/web/account.controller.js
const addressService = require("../../services/address.service");
const paymentMethodService = require("../../services/paymentMethod.service");
const orderService = require("../../services/order.service");
const userService = require("../../services/user.service");
const { validateProfile } = require("../../validators/profile.schema");
const logger = require("../../config/logger");

function toPlainUser(user) {
  if (!user) return null;
  try {
    if (typeof user.get === "function") return user.get({ plain: true });
    if (typeof user.toJSON === "function") return user.toJSON();
  } catch (e) {
    logger.error("Account dashboard: toPlainUser failed", { error: e.message });
  }
  return user;
}

/** Build view data for the account page. Overrides optional (e.g. errors, delivery/billing from form). */
async function getAccountViewData(userId, reqUser, overrides = {}) {
  const userPlain = toPlainUser(reqUser);
  let delivery = overrides.delivery;
  let billing = overrides.billing;
  let sameAsDelivery = overrides.sameAsDelivery;
  if (delivery === undefined || billing === undefined || sameAsDelivery === undefined) {
    const [del, bil] = await Promise.all([
      addressService.getDeliveryAddress(userId),
      addressService.getBillingAddress(userId),
    ]);
    delivery = delivery ?? del ?? {};
    billing = billing ?? (bil && bil.id !== delivery?.id ? bil : delivery) ?? {};
    if (sameAsDelivery === undefined) {
      sameAsDelivery = !bil || !bil.id || (del && bil.id === del.id);
    }
  }
  const hasAddress = !!(delivery && delivery.line1);
  let paymentMethods = overrides.paymentMethods;
  if (paymentMethods === undefined) {
    try {
      paymentMethods = await paymentMethodService.listByUser(userId);
    } catch (err) {
      logger.error("Account: listByUser payment methods failed", { error: err.message, userId });
      paymentMethods = [];
    }
  }
  return {
    title: "Account",
    user: userPlain,
    delivery,
    billing,
    sameAsDelivery,
    hasAddress,
    paymentMethods: paymentMethods || [],
    errors: overrides.errors ?? null,
  };
}

module.exports = {
  getAccountViewData,

  async dashboard(req, res, next) {
    const userId = req.user && req.user.id;
    if (!userId) {
      return res.redirect("/auth/login");
    }
    try {
      const viewData = await getAccountViewData(userId, req.user);
      const config = require("../../config");
      viewData.stripePublishableKey = config.stripe.publishableKey || "";
      return res.render("web/account", viewData);
    } catch (err) {
      logger.error("Account dashboard: failed", { error: err.message, stack: err.stack, userId });
      return next(err);
    }
  },

  async saveProfile(req, res) {
    const userId = req.user && req.user.id;
    if (!userId) return res.redirect("/auth/login");
    const parsed = validateProfile(req.body);
    if (!parsed.ok) {
      res.setFlash("error", "Invalid profile data.");
      return res.redirect("/account");
    }
    await userService.updateProfile(userId, {
      forename: parsed.data.forename,
      surname: parsed.data.surname,
      mobile: parsed.data.mobile,
    });
    res.setFlash("success", "Contact details updated.");
    return res.redirect("/account");
  },
};
