"use strict";

const crypto = require("crypto");

/** Seeds product_categories used across the application. */
const CATEGORIES = [
  { name: "Webinars / Online Courses", slug: "webinars", kpdCode: "85.59.19" },
  { name: "Seminars / Live Workshops", slug: "seminars", kpdCode: "85.59.13" },
  { name: "Classroom Education", slug: "classrooms", kpdCode: "85.59.11" },
];

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    for (const { name, slug, kpdCode } of CATEGORIES) {
      const existing = await queryInterface.sequelize.query(
        "SELECT id FROM product_categories WHERE slug = :slug LIMIT 1",
        { replacements: { slug }, type: queryInterface.sequelize.QueryTypes.SELECT }
      );
      if (existing && existing.length > 0) continue;

      await queryInterface.bulkInsert("product_categories", [
        { id: crypto.randomUUID(), name, slug, kpdCode, createdAt: now, updatedAt: now },
      ]);
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("product_categories", {
      slug: CATEGORIES.map((c) => c.slug),
    });
  },
};
