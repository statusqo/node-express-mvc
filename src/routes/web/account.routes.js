const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const accountController = require("../../controllers/web/account.controller");
const addressesController = require("../../controllers/web/addresses.controller");
const paymentMethodsController = require("../../controllers/web/paymentMethods.controller");
const { requireWebAuth } = require("../../middlewares/auth.middleware");

const router = express.Router();

router.get("/", requireWebAuth, asyncHandler(accountController.dashboard));
router.post("/profile", requireWebAuth, asyncHandler(accountController.saveProfile));

// Addresses (protected): delivery & billing profile
router.get("/addresses", requireWebAuth, asyncHandler(addressesController.list));
router.post("/addresses/save-profile", requireWebAuth, asyncHandler(addressesController.saveProfile));
router.get("/addresses/new", requireWebAuth, asyncHandler(addressesController.showNew));
router.post("/addresses", requireWebAuth, asyncHandler(addressesController.create));
router.get("/addresses/:id/edit", requireWebAuth, asyncHandler(addressesController.showEdit));
router.post("/addresses/:id", requireWebAuth, asyncHandler(addressesController.update));
router.post("/addresses/:id/delete", requireWebAuth, asyncHandler(addressesController.delete));

// Payment methods (protected)
router.get("/payment-methods", requireWebAuth, asyncHandler(paymentMethodsController.list));
router.post("/payment-methods/setup-intent", requireWebAuth, asyncHandler(paymentMethodsController.setupIntent));
router.post("/payment-methods", requireWebAuth, asyncHandler(paymentMethodsController.addPaymentMethod));
router.post("/payment-methods/:id/default", requireWebAuth, asyncHandler(paymentMethodsController.setDefault));
router.post("/payment-methods/:id/delete", requireWebAuth, asyncHandler(paymentMethodsController.delete));

module.exports = router;