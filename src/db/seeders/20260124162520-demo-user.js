"use strict";

const bcrypt = require("bcrypt");
const crypto = require("crypto");

const ADMIN_EMAIL = "admin@example.com";

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    const [existing] = await queryInterface.sequelize.query(
      "SELECT id FROM users WHERE email = :email LIMIT 1",
      { replacements: { email: ADMIN_EMAIL } }
    );
    if (existing && existing.length > 0) return;

    const passwordHash = await bcrypt.hash("admin123", 10);

    await queryInterface.bulkInsert("users", [{
      id: crypto.randomUUID(),
      userNumber: 100001,
      username: "admin",
      email: ADMIN_EMAIL,
      forename: null,
      surname: null,
      mobile: null,
      passwordHash,
      isAdmin: true,
      stripeCustomerId: null,
      googleId: null,
      personType: "private",
      companyName: null,
      companyOib: null,
      createdAt: now,
      updatedAt: now,
    }]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("users", { email: ADMIN_EMAIL }, {});
  },
};
