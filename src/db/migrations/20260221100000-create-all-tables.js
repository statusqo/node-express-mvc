"use strict";

/**
 * Single migration that creates the full current schema.
 * Use on a fresh database only (e.g. after dropping all tables or new environment).
 * Replaces all previous incremental migrations.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const ts = {
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    };
    const uuid = { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true };

    // --- Users & auth ---
    await queryInterface.createTable("users", {
      id: uuid,
      username: { type: Sequelize.STRING, allowNull: true, unique: true },
      email: { type: Sequelize.STRING, allowNull: false, unique: true },
      passwordHash: { type: Sequelize.STRING, allowNull: true },
      isAdmin: { type: Sequelize.BOOLEAN, defaultValue: false },
      stripeCustomerId: { type: Sequelize.STRING, allowNull: true },
      forename: { type: Sequelize.STRING, allowNull: true },
      surname: { type: Sequelize.STRING, allowNull: true },
      mobile: { type: Sequelize.STRING, allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex("users", ["stripeCustomerId"], { unique: true });

    await queryInterface.createTable("sessions", {
      sid: { type: Sequelize.STRING, primaryKey: true },
      userId: { type: Sequelize.STRING },
      expires: { type: Sequelize.DATE },
      data: { type: Sequelize.TEXT },
      ...ts,
    });

    await queryInterface.createTable("addresses", {
      id: uuid,
      userId: { type: Sequelize.UUID, allowNull: true, references: { model: "users", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      label: { type: Sequelize.STRING, allowNull: true },
      line1: { type: Sequelize.STRING, allowNull: false },
      line2: { type: Sequelize.STRING, allowNull: true },
      city: { type: Sequelize.STRING, allowNull: false },
      state: { type: Sequelize.STRING, allowNull: true },
      postcode: { type: Sequelize.STRING, allowNull: false },
      country: { type: Sequelize.STRING, allowNull: false },
      isDefault: { type: Sequelize.BOOLEAN, defaultValue: false },
      ...ts,
    });
    await queryInterface.addIndex("addresses", ["userId"]);

    await queryInterface.createTable("carts", {
      id: uuid,
      userId: { type: Sequelize.UUID, allowNull: true, references: { model: "users", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      sessionId: { type: Sequelize.STRING, allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex("carts", ["userId"]);
    await queryInterface.addIndex("carts", ["sessionId"]);

    await queryInterface.createTable("orders", {
      id: uuid,
      userId: { type: Sequelize.UUID, allowNull: true, references: { model: "users", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      sessionId: { type: Sequelize.STRING, allowNull: true },
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: "pending" },
      total: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      currency: { type: Sequelize.STRING, allowNull: false, defaultValue: "USD" },
      stripePaymentIntentId: { type: Sequelize.STRING, allowNull: true },
      paymentStatus: { type: Sequelize.STRING, allowNull: false, defaultValue: "pending" },
      fulfillmentStatus: { type: Sequelize.STRING, allowNull: false, defaultValue: "pending" },
      forename: { type: Sequelize.STRING, allowNull: true },
      surname: { type: Sequelize.STRING, allowNull: true },
      email: { type: Sequelize.STRING, allowNull: true },
      mobile: { type: Sequelize.STRING, allowNull: true },
      deliveryLine1: { type: Sequelize.STRING, allowNull: true },
      deliveryLine2: { type: Sequelize.STRING, allowNull: true },
      deliveryCity: { type: Sequelize.STRING, allowNull: true },
      deliveryState: { type: Sequelize.STRING, allowNull: true },
      deliveryPostcode: { type: Sequelize.STRING, allowNull: true },
      deliveryCountry: { type: Sequelize.STRING, allowNull: true },
      billingLine1: { type: Sequelize.STRING, allowNull: true },
      billingLine2: { type: Sequelize.STRING, allowNull: true },
      billingCity: { type: Sequelize.STRING, allowNull: true },
      billingState: { type: Sequelize.STRING, allowNull: true },
      billingPostcode: { type: Sequelize.STRING, allowNull: true },
      billingCountry: { type: Sequelize.STRING, allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex("orders", ["userId"]);
    await queryInterface.addIndex("orders", ["sessionId"]);
    await queryInterface.addIndex("orders", ["status"]);
    await queryInterface.addIndex("orders", ["stripePaymentIntentId"]);
    await queryInterface.addIndex("orders", ["paymentStatus"]);
    await queryInterface.addIndex("orders", ["fulfillmentStatus"]);

    // --- Product catalog ---
    await queryInterface.createTable("product_types", {
      id: uuid,
      name: { type: Sequelize.STRING, allowNull: false },
      slug: { type: Sequelize.STRING, allowNull: false, unique: true },
      ...ts,
    });

    await queryInterface.createTable("product_categories", {
      id: uuid,
      name: { type: Sequelize.STRING, allowNull: false },
      slug: { type: Sequelize.STRING, allowNull: false, unique: true },
      parentId: { type: Sequelize.UUID, allowNull: true },
      ...ts,
    });

    await queryInterface.createTable("tags", {
      id: uuid,
      name: { type: Sequelize.STRING, allowNull: false },
      slug: { type: Sequelize.STRING, allowNull: false, unique: true },
      ...ts,
    });

    await queryInterface.createTable("products", {
      id: uuid,
      title: { type: Sequelize.STRING, allowNull: false },
      slug: { type: Sequelize.STRING, allowNull: false, unique: true },
      description: { type: Sequelize.TEXT, allowNull: true },
      productTypeId: { type: Sequelize.UUID, allowNull: true, references: { model: "product_types", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      productCategoryId: { type: Sequelize.UUID, allowNull: true, references: { model: "product_categories", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      active: { type: Sequelize.BOOLEAN, defaultValue: true },
      isPhysical: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      weight: { type: Sequelize.DECIMAL(10, 3), allowNull: true },
      weightUnit: { type: Sequelize.STRING(10), allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex("products", ["productTypeId"]);
    await queryInterface.addIndex("products", ["productCategoryId"]);

    await queryInterface.createTable("product_variants", {
      id: uuid,
      productId: { type: Sequelize.UUID, allowNull: false, references: { model: "products", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      title: { type: Sequelize.STRING, allowNull: false, defaultValue: "Default" },
      sku: { type: Sequelize.STRING, allowNull: true },
      isDefault: { type: Sequelize.BOOLEAN, defaultValue: false },
      active: { type: Sequelize.BOOLEAN, defaultValue: true },
      quantity: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      ...ts,
    });
    await queryInterface.addIndex("product_variants", ["productId"]);

    await queryInterface.createTable("product_prices", {
      id: uuid,
      productVariantId: { type: Sequelize.UUID, allowNull: false, references: { model: "product_variants", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: "USD" },
      isDefault: { type: Sequelize.BOOLEAN, defaultValue: true },
      ...ts,
    });
    await queryInterface.addIndex("product_prices", ["productVariantId"]);

    await queryInterface.createTable("product_tags", {
      id: uuid,
      productId: { type: Sequelize.UUID, allowNull: false, references: { model: "products", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      tagId: { type: Sequelize.UUID, allowNull: false, references: { model: "tags", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      ...ts,
    });
    await queryInterface.addIndex("product_tags", ["productId", "tagId"], { unique: true });

    await queryInterface.createTable("collections", {
      id: uuid,
      title: { type: Sequelize.STRING, allowNull: false },
      slug: { type: Sequelize.STRING, allowNull: false, unique: true },
      description: { type: Sequelize.TEXT, allowNull: true },
      active: { type: Sequelize.BOOLEAN, defaultValue: true },
      ...ts,
    });

    await queryInterface.createTable("product_collections", {
      id: uuid,
      productId: { type: Sequelize.UUID, allowNull: true, references: { model: "products", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      collectionId: { type: Sequelize.UUID, allowNull: false, references: { model: "collections", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      sortOrder: { type: Sequelize.INTEGER, defaultValue: 0 },
      ...ts,
    });
    await queryInterface.addIndex("product_collections", ["productId", "collectionId"], { unique: true });
    await queryInterface.addIndex("product_collections", ["collectionId"]);

    // --- Cart & order lines ---
    await queryInterface.createTable("cart_lines", {
      id: uuid,
      cartId: { type: Sequelize.UUID, allowNull: false, references: { model: "carts", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      productVariantId: { type: Sequelize.UUID, allowNull: false, references: { model: "product_variants", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      quantity: { type: Sequelize.INTEGER, defaultValue: 1 },
      ...ts,
    });
    await queryInterface.addIndex("cart_lines", ["cartId", "productVariantId"], { unique: true });

    await queryInterface.createTable("order_lines", {
      id: uuid,
      orderId: { type: Sequelize.UUID, allowNull: false, references: { model: "orders", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      productVariantId: { type: Sequelize.UUID, allowNull: true, references: { model: "product_variants", key: "id" }, onUpdate: "CASCADE", onDelete: "RESTRICT" },
      price: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      quantity: { type: Sequelize.INTEGER, defaultValue: 1 },
      title: { type: Sequelize.STRING(255), allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex("order_lines", ["orderId"]);

    await queryInterface.createTable("transactions", {
      id: uuid,
      orderId: { type: Sequelize.UUID, allowNull: false, references: { model: "orders", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      currency: { type: Sequelize.STRING, allowNull: false, defaultValue: "USD" },
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: "pending" },
      gateway: { type: Sequelize.STRING, allowNull: true },
      gatewayReference: { type: Sequelize.STRING, allowNull: true },
      metadata: { type: Sequelize.TEXT, allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex("transactions", ["orderId"]);
    await queryInterface.addIndex("transactions", ["gatewayReference"], { name: "transactions_gateway_reference" });

    await queryInterface.createTable("shippings", {
      id: uuid,
      orderId: { type: Sequelize.UUID, allowNull: false, references: { model: "orders", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      addressId: { type: Sequelize.UUID, allowNull: false, references: { model: "addresses", key: "id" }, onUpdate: "CASCADE", onDelete: "RESTRICT" },
      carrier: { type: Sequelize.STRING, allowNull: true },
      trackingNumber: { type: Sequelize.STRING, allowNull: true },
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: "pending" },
      shippedAt: { type: Sequelize.DATE, allowNull: true },
      deliveredAt: { type: Sequelize.DATE, allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex("shippings", ["orderId"]);

    await queryInterface.createTable("payment_methods", {
      id: uuid,
      userId: { type: Sequelize.UUID, allowNull: false, references: { model: "users", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      type: { type: Sequelize.STRING, allowNull: false },
      gateway: { type: Sequelize.STRING, allowNull: false, defaultValue: "stripe" },
      gatewayToken: { type: Sequelize.STRING, allowNull: false },
      last4: { type: Sequelize.STRING(4), allowNull: true },
      brand: { type: Sequelize.STRING, allowNull: true },
      expiryMonth: { type: Sequelize.INTEGER, allowNull: true },
      expiryYear: { type: Sequelize.INTEGER, allowNull: true },
      isDefault: { type: Sequelize.BOOLEAN, defaultValue: false },
      ...ts,
    });
    await queryInterface.addIndex("payment_methods", ["userId"]);
    await queryInterface.addIndex("payment_methods", ["userId", "gateway"], { name: "payment_methods_user_id_gateway" });

    await queryInterface.createTable("user_gateway_profiles", {
      id: uuid,
      userId: { type: Sequelize.UUID, allowNull: false, references: { model: "users", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      gateway: { type: Sequelize.STRING, allowNull: false },
      externalCustomerId: { type: Sequelize.STRING, allowNull: false },
      ...ts,
    });
    await queryInterface.addIndex("user_gateway_profiles", ["userId"]);
    await queryInterface.addIndex("user_gateway_profiles", ["userId", "gateway"], { unique: true });

    // --- Meta objects ---
    await queryInterface.createTable("meta_objects", {
      id: uuid,
      name: { type: Sequelize.STRING, allowNull: false },
      slug: { type: Sequelize.STRING, allowNull: false, unique: true },
      type: { type: Sequelize.STRING, allowNull: true },
      definition: { type: Sequelize.JSON, allowNull: true },
      active: { type: Sequelize.BOOLEAN, defaultValue: true },
      ...ts,
    });
    await queryInterface.addIndex("meta_objects", ["slug"], { unique: true });
    await queryInterface.addIndex("meta_objects", ["type"]);

    await queryInterface.createTable("product_meta_objects", {
      id: uuid,
      productId: { type: Sequelize.UUID, allowNull: false, references: { model: "products", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      metaObjectId: { type: Sequelize.UUID, allowNull: false, references: { model: "meta_objects", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      sortOrder: { type: Sequelize.INTEGER, defaultValue: 0 },
      values: { type: Sequelize.TEXT, allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex("product_meta_objects", ["productId", "metaObjectId"], { unique: true });
    await queryInterface.addIndex("product_meta_objects", ["metaObjectId"]);

    // --- Media (uploaded files; linkable to Products and Collections) ---
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

    // --- Menus ---
    await queryInterface.createTable("menus", {
      id: uuid,
      slug: { type: Sequelize.STRING, allowNull: false, unique: true },
      name: { type: Sequelize.STRING, allowNull: false },
      description: { type: Sequelize.STRING, allowNull: true },
      active: { type: Sequelize.BOOLEAN, defaultValue: true },
      order: { type: Sequelize.INTEGER, defaultValue: 0 },
      ...ts,
    });

    await queryInterface.createTable("menu_items", {
      id: uuid,
      menuId: { type: Sequelize.UUID, allowNull: false, references: { model: "menus", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      label: { type: Sequelize.STRING(255), allowNull: false },
      url: { type: Sequelize.STRING(2048), allowNull: false },
      order: { type: Sequelize.INTEGER, defaultValue: 0 },
      active: { type: Sequelize.BOOLEAN, defaultValue: true },
      parentId: { type: Sequelize.UUID, allowNull: true, references: { model: "menu_items", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      icon: { type: Sequelize.STRING, allowNull: true },
      target: { type: Sequelize.STRING, allowNull: true },
      method: { type: Sequelize.STRING(10), allowNull: true, defaultValue: "GET" },
      slug: { type: Sequelize.STRING(50), allowNull: true },
      cssClass: { type: Sequelize.STRING, allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex("menu_items", ["menuId"]);
    await queryInterface.addIndex("menu_items", ["menuId", "order"]);

    // --- Posts ---
    await queryInterface.createTable("posts", {
      id: uuid,
      title: { type: Sequelize.STRING, allowNull: false },
      slug: { type: Sequelize.STRING, allowNull: false, unique: true },
      excerpt: { type: Sequelize.TEXT, allowNull: true },
      body: { type: Sequelize.TEXT, allowNull: true },
      published: { type: Sequelize.BOOLEAN, defaultValue: false },
      publishedAt: { type: Sequelize.DATE, allowNull: true },
      ...ts,
    });

    // --- Events (seminars/webinars/classrooms; each event = one ProductVariant + ProductPrice) ---
    await queryInterface.createTable("events", {
      id: uuid,
      productId: { type: Sequelize.UUID, allowNull: false, references: { model: "products", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      productVariantId: { type: Sequelize.UUID, allowNull: true, references: { model: "product_variants", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      startDate: { type: Sequelize.DATEONLY, allowNull: false },
      startTime: { type: Sequelize.TIME, allowNull: true },
      durationMinutes: { type: Sequelize.INTEGER, allowNull: true },
      location: { type: Sequelize.STRING, allowNull: true },
      capacity: { type: Sequelize.INTEGER, allowNull: true },
      joiningLink: { type: Sequelize.STRING, allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex("events", ["productId"]);
    await queryInterface.addIndex("events", ["productVariantId"], { unique: true });
  },

  async down(queryInterface) {
    const dropOrder = [
      "menu_items",
      "menus",
      "events",
      "posts",
      "product_meta_objects",
      "collection_media",
      "product_media",
      "media",
      "meta_objects",
      "user_gateway_profiles",
      "payment_methods",
      "shippings",
      "transactions",
      "order_lines",
      "cart_lines",
      "product_collections",
      "collections",
      "product_tags",
      "product_prices",
      "product_variants",
      "products",
      "tags",
      "product_categories",
      "product_types",
      "orders",
      "carts",
      "addresses",
      "sessions",
      "users",
    ];
    for (const table of dropOrder) {
      await queryInterface.dropTable(table);
    }
  },
};
