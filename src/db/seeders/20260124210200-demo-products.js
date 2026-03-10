"use strict";
const crypto = require("crypto");
const { DEFAULT_CURRENCY } = require("../../config/constants");

module.exports = {
  async up(queryInterface) {
    const [existing] = await queryInterface.sequelize.query(
      "SELECT id FROM products LIMIT 1"
    );
    if (existing && existing.length > 0) return;

    const now = new Date();
    const productTypeId = crypto.randomUUID();
    const productCategoryId = crypto.randomUUID();
    await queryInterface.bulkInsert("product_types", [
      { id: productTypeId, name: "Course", slug: "course", createdAt: now, updatedAt: now },
    ]);
    await queryInterface.bulkInsert("product_categories", [
      { id: productCategoryId, name: "Learning", slug: "learning", parentId: null, createdAt: now, updatedAt: now },
    ]);

    const products = [
      { title: "Introduction to Web Development", slug: "intro-web-dev", description: "Learn HTML, CSS, and JavaScript basics.", price: 99 },
      { title: "Node.js & Express", slug: "node-express", description: "Backend development with Node.js and Express.", price: 149 },
      { title: "Database Fundamentals", slug: "database-fundamentals", description: "SQL, data modeling, and relational databases.", price: 79 },
    ];

    const collectionId = crypto.randomUUID();
    await queryInterface.bulkInsert("collections", [
      { id: collectionId, title: "Featured", slug: "featured", description: "Featured products", active: true, createdAt: now, updatedAt: now },
    ]);

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const productId = crypto.randomUUID();
      const variantId = crypto.randomUUID();
      const priceId = crypto.randomUUID();
      await queryInterface.bulkInsert("products", [
        { id: productId, title: p.title, slug: p.slug, description: p.description || null, productTypeId, productCategoryId, active: true, createdAt: now, updatedAt: now },
      ]);
      await queryInterface.bulkInsert("product_variants", [
        { id: variantId, productId, title: "Default", isDefault: true, active: true, createdAt: now, updatedAt: now },
      ]);
      await queryInterface.bulkInsert("product_prices", [
        { id: priceId, productVariantId: variantId, amount: p.price, currency: DEFAULT_CURRENCY, isDefault: true, createdAt: now, updatedAt: now },
      ]);
      await queryInterface.bulkInsert("product_collections", [
        { id: crypto.randomUUID(), productId, collectionId, sortOrder: i, createdAt: now, updatedAt: now },
      ]);
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("product_collections", null, {});
    await queryInterface.bulkDelete("product_prices", null, {});
    await queryInterface.bulkDelete("product_variants", null, {});
    await queryInterface.bulkDelete("products", null, {});
    await queryInterface.bulkDelete("collections", { slug: "featured" }, {});
    await queryInterface.bulkDelete("product_categories", { slug: "learning" }, {});
    await queryInterface.bulkDelete("product_types", { slug: "course" }, {});
  },
};
