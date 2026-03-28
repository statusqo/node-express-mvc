"use strict";

const crypto = require("crypto");
const { DEFAULT_CURRENCY } = require("../../config/constants");
const { generateVariantSku } = require("../../utils/skuGenerator");

/**
 * Demo products. Runs after seed-product-types and seed-product-categories.
 * All products are non-physical educational services (isPhysical: false, unitOfMeasure: "usl").
 */
const PRODUCTS = [
  // Webinars
  { title: "Infekcije", slug: "infekcije", description: "Prepoznavanje i liječenje bolničkih i izvanbolničkih infekcija.", type: "webinar", category: "webinars", price: 30 },
  { title: "Dekubitus", slug: "dekubitus", description: "Prevencija i zbrinjavanje dekubitusa u kliničkoj praksi.", type: "webinar", category: "webinars", price: 30 },
  { title: "Prevencija Infekcija", slug: "prevencija-infekcija", description: "Mjere prevencije u bolničkom okruženju.", type: "webinar", category: "webinars", price: 30 },
  { title: "Rane i Previjanje", slug: "rane-i-previjanje", description: "Tehnike previjanja akutnih i kroničnih rana.", type: "webinar", category: "webinars", price: 35 },
  { title: "Palijativna Skrb", slug: "palijativna-skrb", description: "Principi palijativne njege i komunikacija s pacijentima.", type: "webinar", category: "webinars", price: 40 },
  // Seminars
  { title: "Kardiovaskularni Sustav", slug: "kardiovaskularni-sustav", description: "Klinička obrada kardiovaskularnih bolesti.", type: "seminar", category: "seminars", price: 45 },
  { title: "Dijabetes u Kliničkoj Praksi", slug: "dijabetes-u-klinickoj-praksi", description: "Dijagnostika i terapija dijabetesa tipa 1 i 2.", type: "seminar", category: "seminars", price: 50 },
  { title: "Hitna Medicina", slug: "hitna-medicina", description: "Protokoli i algoritmi u hitnoj medicinskoj službi.", type: "seminar", category: "seminars", price: 60 },
  // Classrooms
  { title: "Farmakoterapija Boli", slug: "farmakoterapija-boli", description: "Analgetici i adjuvantna terapija u liječenju boli.", type: "classroom", category: "classrooms", price: 55 },
  { title: "Antibiotska Terapija", slug: "antibiotska-terapija", description: "Racionalna primjena antibiotika i rezistencija.", type: "classroom", category: "classrooms", price: 50 },
];

module.exports = {
  async up(queryInterface) {
    const [existing] = await queryInterface.sequelize.query("SELECT id FROM products LIMIT 1");
    if (existing && existing.length > 0) return;

    const now = new Date();

    // Look up product types by slug
    const typeRows = await queryInterface.sequelize.query(
      "SELECT id, slug FROM product_types",
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    const typeBySlug = Object.fromEntries(typeRows.map((r) => [r.slug, r.id]));

    // Look up product categories by slug
    const catRows = await queryInterface.sequelize.query(
      "SELECT id, slug FROM product_categories",
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    const catBySlug = Object.fromEntries(catRows.map((r) => [r.slug, r.id]));

    // Featured collection
    const collectionId = crypto.randomUUID();
    await queryInterface.bulkInsert("collections", [
      { id: collectionId, title: "Featured", slug: "featured", description: "Featured products", active: true, createdAt: now, updatedAt: now },
    ]);

    for (let i = 0; i < PRODUCTS.length; i++) {
      const p = PRODUCTS[i];
      const productTypeId = typeBySlug[p.type] || null;
      const productCategoryId = catBySlug[p.category] || null;

      const productId = crypto.randomUUID();
      const variantId = crypto.randomUUID();

      await queryInterface.bulkInsert("products", [{
        id: productId,
        title: p.title,
        slug: p.slug,
        description: p.description || null,
        productTypeId,
        productCategoryId,
        taxRateId: null,
        active: true,
        isPhysical: false,
        weight: null,
        weightUnit: null,
        unitOfMeasure: "usl",
        createdAt: now,
        updatedAt: now,
      }]);

      await queryInterface.bulkInsert("product_variants", [{
        id: variantId,
        productId,
        title: "Default",
        sku: generateVariantSku(p.title, 0),
        isDefault: true,
        active: true,
        quantity: 0,
        createdAt: now,
        updatedAt: now,
      }]);

      await queryInterface.bulkInsert("product_prices", [{
        id: crypto.randomUUID(),
        productVariantId: variantId,
        amount: p.price,
        currency: DEFAULT_CURRENCY,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      }]);

      await queryInterface.bulkInsert("product_collections", [{
        id: crypto.randomUUID(),
        productId,
        collectionId,
        sortOrder: i,
        createdAt: now,
        updatedAt: now,
      }]);
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("product_collections", null, {});
    await queryInterface.bulkDelete("product_prices", null, {});
    await queryInterface.bulkDelete("product_variants", null, {});
    await queryInterface.bulkDelete("products", null, {});
    await queryInterface.bulkDelete("collections", { slug: "featured" }, {});
  },
};
