"use strict";

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
      googleId: { type: Sequelize.STRING, allowNull: true },
      personType: { type: Sequelize.ENUM('private', 'legal'), allowNull: false, defaultValue: 'private' },
      companyName: { type: Sequelize.STRING, allowNull: true },
      companyOib: { type: Sequelize.STRING(11), allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex("users", ["stripeCustomerId"], { unique: true });
    await queryInterface.addIndex("users", ["googleId"], { unique: true, name: "users_google_id_unique" });

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
      personType: { type: Sequelize.ENUM('private', 'legal'), allowNull: false, defaultValue: 'private' },
      companyName: { type: Sequelize.STRING, allowNull: true },
      companyOib: { type: Sequelize.STRING(11), allowNull: true },
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

    // --- Cart lines ---
    await queryInterface.createTable("cart_lines", {
      id: uuid,
      cartId: { type: Sequelize.UUID, allowNull: false, references: { model: "carts", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      productVariantId: { type: Sequelize.UUID, allowNull: false, references: { model: "product_variants", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      quantity: { type: Sequelize.INTEGER, defaultValue: 1 },
      ...ts,
    });
    await queryInterface.addIndex("cart_lines", ["cartId", "productVariantId"], { unique: true });

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

    // --- Media ---
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
      bodyIsHtml: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      published: { type: Sequelize.BOOLEAN, defaultValue: false },
      publishedAt: { type: Sequelize.DATE, allowNull: true },
      ...ts,
    });

    // --- Events ---
    await queryInterface.createTable("events", {
      id: uuid,
      productId: { type: Sequelize.UUID, allowNull: false, references: { model: "products", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      productVariantId: { type: Sequelize.UUID, allowNull: true, references: { model: "product_variants", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      startDate: { type: Sequelize.DATEONLY, allowNull: false },
      startTime: { type: Sequelize.TIME, allowNull: true },
      durationMinutes: { type: Sequelize.INTEGER, allowNull: true },
      location: { type: Sequelize.STRING, allowNull: true },
      capacity: { type: Sequelize.INTEGER, allowNull: true },
      isOnline: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      timezone: { type: Sequelize.STRING, allowNull: true },
      eventStatus: { type: Sequelize.STRING, allowNull: false, defaultValue: "active" },
      ...ts,
    });
    await queryInterface.addIndex("events", ["productId"]);
    await queryInterface.addIndex("events", ["productVariantId"], { unique: true });

    // --- Order lines (after events due to eventId FK) ---
    await queryInterface.createTable("order_lines", {
      id: uuid,
      orderId: { type: Sequelize.UUID, allowNull: false, references: { model: "orders", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      productVariantId: { type: Sequelize.UUID, allowNull: true, references: { model: "product_variants", key: "id" }, onUpdate: "CASCADE", onDelete: "RESTRICT" },
      eventId: { type: Sequelize.UUID, allowNull: true, references: { model: "events", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      price: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      quantity: { type: Sequelize.INTEGER, defaultValue: 1 },
      title: { type: Sequelize.STRING(255), allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex("order_lines", ["orderId"]);
    await queryInterface.addIndex("order_lines", ["eventId"]);

    // --- Refund requests ---
    await queryInterface.createTable("refund_requests", {
      id: uuid,
      orderId: { type: Sequelize.UUID, allowNull: false, references: { model: "orders", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: "pending" },
      reason: { type: Sequelize.TEXT, allowNull: true },
      requestedByUserId: { type: Sequelize.UUID, allowNull: true, references: { model: "users", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      processedAt: { type: Sequelize.DATE, allowNull: true },
      processedByUserId: { type: Sequelize.UUID, allowNull: true, references: { model: "users", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      stripeRefundId: { type: Sequelize.STRING, allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex("refund_requests", ["orderId"]);
    await queryInterface.addIndex("refund_requests", ["status"]);
    await queryInterface.addIndex("refund_requests", ["requestedByUserId"]);

    // --- Registrations & meeting providers ---
    await queryInterface.createTable("admin_zoom_accounts", {
      id: uuid,
      userId: { type: Sequelize.UUID, allowNull: false, references: { model: "users", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      zoomUserId: { type: Sequelize.STRING, allowNull: false },
      accessToken: { type: Sequelize.TEXT, allowNull: false },
      refreshToken: { type: Sequelize.TEXT, allowNull: true },
      tokenExpiresAt: { type: Sequelize.DATE, allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex("admin_zoom_accounts", ["userId"], { unique: true });
    await queryInterface.addIndex("admin_zoom_accounts", ["zoomUserId"]);

    await queryInterface.createTable("registrations", {
      id: uuid,
      eventId: { type: Sequelize.UUID, allowNull: false, references: { model: "events", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      orderId: { type: Sequelize.UUID, allowNull: false, references: { model: "orders", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      orderLineId: { type: Sequelize.UUID, allowNull: false, references: { model: "order_lines", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      userId: { type: Sequelize.UUID, allowNull: true, references: { model: "users", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      email: { type: Sequelize.STRING, allowNull: false },
      forename: { type: Sequelize.STRING, allowNull: true },
      surname: { type: Sequelize.STRING, allowNull: true },
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: "registered" },
      providerRegistrantId: { type: Sequelize.STRING, allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex("registrations", ["eventId"]);
    await queryInterface.addIndex("registrations", ["orderId"]);
    await queryInterface.addIndex("registrations", ["orderLineId"]);
    await queryInterface.addIndex("registrations", ["eventId", "orderLineId"], { unique: true });

    await queryInterface.createTable("event_meetings", {
      id: uuid,
      eventId: { type: Sequelize.UUID, allowNull: false, references: { model: "events", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      provider: { type: Sequelize.STRING, allowNull: false, defaultValue: "zoom" },
      providerMeetingId: { type: Sequelize.STRING, allowNull: false },
      joinUrl: { type: Sequelize.TEXT, allowNull: false },
      startUrl: { type: Sequelize.TEXT, allowNull: true },
      hostAccountId: { type: Sequelize.UUID, allowNull: true, references: { model: "admin_zoom_accounts", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      ...ts,
    });
    await queryInterface.addIndex("event_meetings", ["eventId"], { unique: true });
    await queryInterface.addIndex("event_meetings", ["providerMeetingId"]);

    // --- Invoices (receipts + R1 receipts) ---
    await queryInterface.createTable("invoices", {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      orderId: { type: Sequelize.UUID, allowNull: false, unique: true, references: { model: "orders", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      invoiceNumber: { type: Sequelize.STRING, allowNull: false, unique: true },
      type: { type: Sequelize.ENUM("receipt", "r1"), allowNull: false },
      sequenceNumber: { type: Sequelize.INTEGER, allowNull: false },
      year: { type: Sequelize.INTEGER, allowNull: false },
      pdfPath: { type: Sequelize.STRING, allowNull: true },
      generatedAt: { type: Sequelize.DATE, allowNull: false },
      ...ts,
    });
    await queryInterface.addIndex("invoices", ["orderId"], { unique: true });
    await queryInterface.addIndex("invoices", ["year", "type"]);
  },

  async down(queryInterface) {
    const tables = [
      "invoices",
      "event_meetings",
      "registrations",
      "admin_zoom_accounts",
      "refund_requests",
      "order_lines",
      "events",
      "posts",
      "menu_items",
      "menus",
      "collection_media",
      "product_media",
      "media",
      "product_meta_objects",
      "meta_objects",
      "user_gateway_profiles",
      "payment_methods",
      "shippings",
      "transactions",
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
    for (const table of tables) {
      await queryInterface.dropTable(table);
    }
  },
};
