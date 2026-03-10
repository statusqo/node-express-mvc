"use strict";

// Migration to set all existing currency columns to the default currency constant.
// After this runs, products/orders/transactions will always hold the same value
// and the application no longer allows changing it from the UI.

const { DEFAULT_CURRENCY } = require("../../config/constants");

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkUpdate("product_prices", { currency: DEFAULT_CURRENCY }, {});
    await queryInterface.bulkUpdate("orders", { currency: DEFAULT_CURRENCY }, {});
    await queryInterface.bulkUpdate("transactions", { currency: DEFAULT_CURRENCY }, {});
  },

  async down(queryInterface) {
    // revert back to USD as a safe fallback
    await queryInterface.bulkUpdate("product_prices", { currency: "USD" }, {});
    await queryInterface.bulkUpdate("orders", { currency: "USD" }, {});
    await queryInterface.bulkUpdate("transactions", { currency: "USD" }, {});
  },
};
