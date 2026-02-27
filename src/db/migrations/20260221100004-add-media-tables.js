"use strict";

/**
 * Adds media, product_media, and collection_media tables for existing databases
 * that were migrated before these tables were added to the schema.
 * Safe to run: creates tables only if they do not exist (run will fail if tables already exist;
 * use down() to remove them if you need to re-run).
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const ts = {
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    };
    const uuid = { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true };

    await queryInterface.createTable("media", {
      id: uuid,
      path: { type: Sequelize.STRING, allowNull: false },
      filename: { type: Sequelize.STRING, allowNull: true },
      mimeType: { type: Sequelize.STRING, allowNull: true },
      size: { type: Sequelize.INTEGER, allowNull: true },
      alt: { type: Sequelize.STRING, allowNull: true },
      ...ts,
    });

    await queryInterface.createTable("product_media", {
      id: uuid,
      productId: { type: Sequelize.UUID, allowNull: false, references: { model: "products", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      mediaId: { type: Sequelize.UUID, allowNull: false, references: { model: "media", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      sortOrder: { type: Sequelize.INTEGER, defaultValue: 0 },
      ...ts,
    });
    await queryInterface.addIndex("product_media", ["productId", "mediaId"], { unique: true });
    await queryInterface.addIndex("product_media", ["mediaId"]);

    await queryInterface.createTable("collection_media", {
      id: uuid,
      collectionId: { type: Sequelize.UUID, allowNull: false, references: { model: "collections", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      mediaId: { type: Sequelize.UUID, allowNull: false, references: { model: "media", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      sortOrder: { type: Sequelize.INTEGER, defaultValue: 0 },
      ...ts,
    });
    await queryInterface.addIndex("collection_media", ["collectionId", "mediaId"], { unique: true });
    await queryInterface.addIndex("collection_media", ["mediaId"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("collection_media");
    await queryInterface.dropTable("product_media");
    await queryInterface.dropTable("media");
  },
};
