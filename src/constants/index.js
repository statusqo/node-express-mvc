/**
 * Central constants. Import from here or from specific modules.
 * Order status constants are source of truth in constants/order.js.
 */
const order = require("./order");
const transaction = require("./transaction");
const address = require("./address");
const event = require("./event");
const product = require("./product");
const refundRequest = require("./refundRequest");
const registration = require("./registration");
const user = require("./user");
const discount = require("./discount");

module.exports = {
  ...order,
  ...transaction,
  ...address,
  ...event,
  ...product,
  ...refundRequest,
  ...registration,
  ...user,
  ...discount,
};
