"use strict";

const bcrypt = require("bcrypt");
const crypto = require("crypto");

const DEMO_PASSWORD = "password123";

const USERS = [
  // Admin
  {
    username: "admin",
    email: "admin@example.com",
    password: "admin123",
    isAdmin: true,
    personType: "private",
  },
  // Private persons
  {
    username: "marija.kovacic",
    email: "marija.kovacic@example.com",
    forename: "Marija",
    surname: "Kovačić",
    mobile: "+385912345678",
    personType: "private",
  },
  {
    username: "ivan.peric",
    email: "ivan.peric@example.com",
    forename: "Ivan",
    surname: "Perić",
    mobile: "+385981234567",
    personType: "private",
  },
  {
    username: "ana.novak",
    email: "ana.novak@example.com",
    forename: "Ana",
    surname: "Novak",
    mobile: "+385951234567",
    personType: "private",
  },
  {
    username: "tomislav.babic",
    email: "tomislav.babic@example.com",
    forename: "Tomislav",
    surname: "Babić",
    mobile: "+385911234567",
    personType: "private",
  },
  // Legal persons (companies)
  {
    username: "petra.blazevic",
    email: "petra.blazevic@medilab.hr",
    forename: "Petra",
    surname: "Blažević",
    mobile: "+38514567890",
    personType: "legal",
    companyName: "Medilab d.o.o.",
    companyOib: "12345678901",
  },
  {
    username: "boris.kralj",
    email: "boris.kralj@zdravomedicina.hr",
    forename: "Boris",
    surname: "Kralj",
    mobile: "+38512345678",
    personType: "legal",
    companyName: "Zdravo Medicina d.o.o.",
    companyOib: "98765432109",
  },
  {
    username: "sanja.matic",
    email: "sanja.matic@klinikabozena.hr",
    forename: "Sanja",
    surname: "Matić",
    mobile: "+38516789012",
    personType: "legal",
    companyName: "Klinika Božena d.o.o.",
    companyOib: "11223344556",
  },
];

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    for (const u of USERS) {
      const [existing] = await queryInterface.sequelize.query(
        "SELECT id FROM users WHERE email = :email LIMIT 1",
        { replacements: { email: u.email } }
      );
      if (existing && existing.length > 0) continue;

      const passwordHash = await bcrypt.hash(u.password || DEMO_PASSWORD, 10);

      await queryInterface.bulkInsert("users", [{
        id: crypto.randomUUID(),
        username: u.username,
        email: u.email,
        forename: u.forename || null,
        surname: u.surname || null,
        mobile: u.mobile || null,
        passwordHash,
        isAdmin: u.isAdmin || false,
        stripeCustomerId: null,
        googleId: null,
        personType: u.personType,
        companyName: u.companyName || null,
        companyOib: u.companyOib || null,
        createdAt: now,
        updatedAt: now,
      }]);
    }
  },

  async down(queryInterface) {
    const emails = USERS.map((u) => u.email);
    await queryInterface.bulkDelete("users", { email: emails }, {});
  },
};
