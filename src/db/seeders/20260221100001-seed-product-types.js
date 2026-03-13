"use strict";

const crypto = require("crypto");

/** Seeds product_types: Webinar, Service, Classroom. */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const types = [
      { name: "Webinar", slug: "webinar" },
      { name: "Seminar", slug: "seminar" },
      { name: "Classroom", slug: "classroom" },
    ];

    for (const { name, slug } of types) {
      const existing = await queryInterface.sequelize.query(
        `SELECT id FROM product_types WHERE slug = :slug LIMIT 1`,
        { replacements: { slug }, type: queryInterface.sequelize.QueryTypes.SELECT }
      );
      if (existing && existing.length > 0) continue;

      await queryInterface.bulkInsert("product_types", [
        { id: crypto.randomUUID(), name, slug, createdAt: now, updatedAt: now },
      ]);
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("product_types", {
      slug: ["webinar", "seminar", "classroom"],
    });
  },
};
