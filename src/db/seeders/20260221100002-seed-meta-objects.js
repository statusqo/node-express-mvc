"use strict";

const crypto = require("crypto");

/** Seeds meta_objects: Webinar, Service, Classroom (type definitions). */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const objects = [
      { name: "Webinar", slug: "webinar" },
      { name: "Service", slug: "service" },
      { name: "Classroom", slug: "classroom" },
    ];

    for (const { name, slug } of objects) {
      const existing = await queryInterface.sequelize.query(
        `SELECT id FROM meta_objects WHERE slug = :slug LIMIT 1`,
        { replacements: { slug }, type: queryInterface.sequelize.QueryTypes.SELECT }
      );
      if (existing && existing.length > 0) continue;

      await queryInterface.bulkInsert("meta_objects", [
        {
          id: crypto.randomUUID(),
          name,
          slug,
          type: null,
          definition: "[]",
          active: true,
          createdAt: now,
          updatedAt: now,
        },
      ]);
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("meta_objects", {
      slug: ["webinar", "service", "classroom"],
    });
  },
};
