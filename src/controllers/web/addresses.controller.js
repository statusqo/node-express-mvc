const accountController = require("./account.controller");
const addressService = require("../../services/address.service");
const { validateAddress, validateProfileAddresses } = require("../../validators/address.schema");

function requireUser(req) {
  if (!req.user) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
  return req.user.id;
}

module.exports = {
  async list(req, res) {
    return res.redirect("/account");
  },

  async saveProfile(req, res) {
    const userId = requireUser(req);
    const parsed = validateProfileAddresses(req.body);
    if (!parsed.ok) {
      res.setFlash("error", "Please fix the form errors.");
      const viewData = await accountController.getAccountViewData(userId, req.user, {
        delivery: { line1: req.body.deliveryLine1, line2: req.body.deliveryLine2, city: req.body.deliveryCity, state: req.body.deliveryState, postcode: req.body.deliveryPostcode, country: req.body.deliveryCountry },
        billing: { line1: req.body.billingLine1, line2: req.body.billingLine2, city: req.body.billingCity, state: req.body.billingState, postcode: req.body.billingPostcode, country: req.body.billingCountry },
        sameAsDelivery: !!parsed.data.sameAsDelivery,
        errors: parsed.errors,
      });
      return res.render("web/account", viewData);
    }
    const { sameAsDelivery } = parsed.data;
    await addressService.saveDeliveryAddress(userId, {
      line1: parsed.data.deliveryLine1,
      line2: parsed.data.deliveryLine2 ?? null,
      city: parsed.data.deliveryCity,
      state: parsed.data.deliveryState ?? null,
      postcode: parsed.data.deliveryPostcode,
      country: parsed.data.deliveryCountry,
    });
    if (sameAsDelivery) {
      await addressService.saveBillingSameAsDelivery(userId);
    } else {
      await addressService.saveBillingAddress(userId, {
        line1: parsed.data.billingLine1,
        line2: parsed.data.billingLine2 ?? null,
        city: parsed.data.billingCity,
        state: parsed.data.billingState ?? null,
        postcode: parsed.data.billingPostcode,
        country: parsed.data.billingCountry,
      });
    }
    res.setFlash("success", "Delivery and billing addresses updated.");
    return res.redirect("/account");
  },

  async showNew(req, res) {
    requireUser(req);
    res.render("web/account/address-form", {
      title: "New Address",
      address: null,
    });
  },

  async create(req, res) {
    const userId = requireUser(req);
    const parsed = validateAddress(req.body);
    if (!parsed.ok) {
      res.setFlash("error", "Please fix the form errors.");
      return res.render("web/account/address-form", {
        title: "New Address",
        address: req.body,
        errors: parsed.errors,
      });
    }
    await addressService.create(userId, parsed.data);
    res.setFlash("success", "Address added.");
    return res.redirect("/account");
  },

  async showEdit(req, res) {
    const userId = requireUser(req);
    const address = await addressService.getById(req.params.id, userId);
    if (!address) {
      const err = new Error("Address not found.");
      err.status = 404;
      throw err;
    }
    res.render("web/account/address-form", {
      title: "Edit Address",
      address,
    });
  },

  async update(req, res) {
    const userId = requireUser(req);
    const parsed = validateAddress(req.body);
    if (!parsed.ok) {
      res.setFlash("error", "Please fix the form errors.");
      return res.render("web/account/address-form", {
        title: "Edit Address",
        address: { ...req.body, id: req.params.id },
        errors: parsed.errors,
      });
    }
    const updated = await addressService.update(req.params.id, userId, parsed.data);
    if (!updated) {
      const err = new Error("Address not found.");
      err.status = 404;
      throw err;
    }
    res.setFlash("success", "Address updated.");
    return res.redirect("/account");
  },

  async delete(req, res) {
    const userId = requireUser(req);
    const deleted = await addressService.remove(req.params.id, userId);
    if (!deleted) {
      const err = new Error("Address not found.");
      err.status = 404;
      throw err;
    }
    res.setFlash("success", "Address removed.");
    return res.redirect("/account");
  },
};
