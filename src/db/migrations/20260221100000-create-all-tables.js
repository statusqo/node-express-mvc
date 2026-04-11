"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const uuid = { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true };
    const ts = {
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    };

    // --- users ---
    await queryInterface.createTable("users", {
      id: uuid,
      userNumber: { type: Sequelize.INTEGER, allowNull: true, unique: true },
      username: { type: Sequelize.STRING, allowNull: true, unique: true },
      email: { type: Sequelize.STRING, allowNull: false, unique: true },
      forename: { type: Sequelize.STRING, allowNull: true },
      surname: { type: Sequelize.STRING, allowNull: true },
      mobile: { type: Sequelize.STRING, allowNull: true },
      passwordHash: { type: Sequelize.STRING, allowNull: true },
      isAdmin: { type: Sequelize.BOOLEAN, defaultValue: false },
      stripeCustomerId: { type: Sequelize.STRING, allowNull: true, unique: true },
      googleId: { type: Sequelize.STRING, allowNull: true, unique: true },
      personType: { type: Sequelize.ENUM("private", "legal"), allowNull: false, defaultValue: "private" },
      companyName: { type: Sequelize.STRING, allowNull: true },
      companyOib: { type: Sequelize.STRING(11), allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex("users", ["stripeCustomerId"]);

    // --- addresses ---
    await queryInterface.createTable("addresses", {
      id: uuid,
      userId: { type: Sequelize.UUID, allowNull: true, references: { model: "users", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      label: { type: Sequelize.ENUM("delivery", "billing"), allowNull: false, defaultValue: "delivery" },
      line1: { type: Sequelize.STRING, allowNull: false },
      line2: { type: Sequelize.STRING, allowNull: true },
      city: { type: Sequelize.STRING, allowNull: false },
      state: { type: Sequelize.STRING, allowNull: true },
      postcode: { type: Sequelize.STRING, allowNull: false },
      country: { type: Sequelize.STRING, allowNull: false },
      isDefault: { type: Sequelize.BOOLEAN, defaultValue: false },
      ...ts,
    });

    // --- menus ---
    await queryInterface.createTable("menus", {
      id: uuid,
      slug: { type: Sequelize.STRING, allowNull: false, unique: true },
      name: { type: Sequelize.STRING, allowNull: false },
      description: { type: Sequelize.STRING, allowNull: true },
      active: { type: Sequelize.BOOLEAN, defaultValue: true },
      order: { type: Sequelize.INTEGER, defaultValue: 0 },
      ...ts,
    });

    // --- menu_items (self-referential via parentId) ---
    await queryInterface.createTable("menu_items", {
      id: uuid,
      menuId: { type: Sequelize.UUID, allowNull: false, references: { model: "menus", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      label: { type: Sequelize.STRING(255), allowNull: false },
      url: { type: Sequelize.STRING(2048), allowNull: false },
      order: { type: Sequelize.INTEGER, defaultValue: 0 },
      active: { type: Sequelize.BOOLEAN, defaultValue: true },
      parentId: { type: Sequelize.UUID, allowNull: true, references: { model: "menu_items", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      icon: { type: Sequelize.STRING, allowNull: true },
      target: { type: Sequelize.STRING, allowNull: true },
      method: { type: Sequelize.STRING(10), allowNull: true, defaultValue: "GET" },
      slug: { type: Sequelize.STRING(50), allowNull: true },
      cssClass: { type: Sequelize.STRING, allowNull: true },
      ...ts,
    });

    // --- posts ---
    await queryInterface.createTable("posts", {
      id: uuid,
      title: { type: Sequelize.STRING, allowNull: false },
      slug: { type: Sequelize.STRING, allowNull: false, unique: true },
      excerpt: { type: Sequelize.TEXT, allowNull: true },
      body: { type: Sequelize.TEXT, allowNull: true },
      published: { type: Sequelize.BOOLEAN, defaultValue: false },
      bodyIsHtml: { type: Sequelize.BOOLEAN, defaultValue: false },
      publishedAt: { type: Sequelize.DATE, allowNull: true },
      ...ts,
    });

    // --- product_types ---
    await queryInterface.createTable("product_types", {
      id: uuid,
      name: { type: Sequelize.STRING, allowNull: false },
      slug: { type: Sequelize.STRING, allowNull: false, unique: true },
      ...ts,
    });

    // --- product_categories ---
    await queryInterface.createTable("product_categories", {
      id: uuid,
      name: { type: Sequelize.STRING, allowNull: false },
      slug: { type: Sequelize.STRING, allowNull: false, unique: true },
      kpdCode: { type: Sequelize.STRING, allowNull: false },
      ...ts,
    });

    // --- tax_rates ---
    await queryInterface.createTable("tax_rates", {
      id: uuid,
      name: { type: Sequelize.STRING, allowNull: false },
      stripeTaxRateId: { type: Sequelize.STRING, allowNull: false, unique: true },
      percentage: { type: Sequelize.INTEGER, allowNull: false },
      ...ts,
    });

    // --- tags ---
    await queryInterface.createTable("tags", {
      id: uuid,
      name: { type: Sequelize.STRING, allowNull: false },
      slug: { type: Sequelize.STRING, allowNull: false, unique: true },
      ...ts,
    });

    // --- media ---
    await queryInterface.createTable("media", {
      id: uuid,
      path: { type: Sequelize.STRING, allowNull: false },
      filename: { type: Sequelize.STRING, allowNull: true },
      mimeType: { type: Sequelize.STRING, allowNull: true },
      size: { type: Sequelize.INTEGER, allowNull: true },
      alt: { type: Sequelize.STRING, allowNull: true },
      ...ts,
    });

    // --- collections ---
    await queryInterface.createTable("collections", {
      id: uuid,
      title: { type: Sequelize.STRING, allowNull: false },
      slug: { type: Sequelize.STRING, allowNull: false, unique: true },
      description: { type: Sequelize.TEXT, allowNull: true },
      active: { type: Sequelize.BOOLEAN, defaultValue: true },
      featuredMediaId: { type: Sequelize.UUID, allowNull: true, references: { model: "media", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      ...ts,
    });

    // --- meta_objects ---
    await queryInterface.createTable("meta_objects", {
      id: uuid,
      name: { type: Sequelize.STRING, allowNull: false },
      slug: { type: Sequelize.STRING, allowNull: false, unique: true },
      type: { type: Sequelize.STRING, allowNull: true },
      definition: { type: Sequelize.JSON, allowNull: true },
      active: { type: Sequelize.BOOLEAN, defaultValue: true },
      ...ts,
    });

    // --- products ---
    await queryInterface.createTable("products", {
      id: uuid,
      title: { type: Sequelize.STRING, allowNull: false },
      slug: { type: Sequelize.STRING, allowNull: false, unique: true },
      description: { type: Sequelize.TEXT, allowNull: true },
      productTypeId: { type: Sequelize.UUID, allowNull: true, references: { model: "product_types", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      productCategoryId: { type: Sequelize.UUID, allowNull: false, references: { model: "product_categories", key: "id" }, onUpdate: "CASCADE", onDelete: "RESTRICT" },
      taxRateId: { type: Sequelize.UUID, allowNull: true, references: { model: "tax_rates", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      active: { type: Sequelize.BOOLEAN, defaultValue: true },
      isPhysical: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      weight: { type: Sequelize.DECIMAL(10, 3), allowNull: true },
      weightUnit: { type: Sequelize.ENUM("g", "kg"), allowNull: true },
      unitOfMeasure: { type: Sequelize.ENUM("kom", "h", "mj", "usl", "god"), allowNull: false },
      featuredMediaId: { type: Sequelize.UUID, allowNull: true, references: { model: "media", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      ...ts,
    });

    // --- product_variants ---
    await queryInterface.createTable("product_variants", {
      id: uuid,
      productId: { type: Sequelize.UUID, allowNull: false, references: { model: "products", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      title: { type: Sequelize.STRING, allowNull: false, defaultValue: "Default" },
      sku: { type: Sequelize.STRING, allowNull: false },
      isDefault: { type: Sequelize.BOOLEAN, defaultValue: false },
      active: { type: Sequelize.BOOLEAN, defaultValue: true },
      quantity: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      ...ts,
    });

    // --- product_prices ---
    await queryInterface.createTable("product_prices", {
      id: uuid,
      productVariantId: { type: Sequelize.UUID, allowNull: false, references: { model: "product_variants", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: "EUR" },
      isDefault: { type: Sequelize.BOOLEAN, defaultValue: false },
      ...ts,
    });

    // --- product_tags ---
    await queryInterface.createTable("product_tags", {
      id: uuid,
      productId: { type: Sequelize.UUID, allowNull: false, references: { model: "products", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      tagId: { type: Sequelize.UUID, allowNull: false, references: { model: "tags", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      ...ts,
    });
    await queryInterface.addIndex("product_tags", ["productId", "tagId"], { unique: true });

    // --- product_collections ---
    await queryInterface.createTable("product_collections", {
      id: uuid,
      productId: { type: Sequelize.UUID, allowNull: false, references: { model: "products", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      collectionId: { type: Sequelize.UUID, allowNull: false, references: { model: "collections", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      sortOrder: { type: Sequelize.INTEGER, defaultValue: 0 },
      ...ts,
    });
    await queryInterface.addIndex("product_collections", ["productId", "collectionId"], { unique: true });

    // --- product_meta_objects ---
    await queryInterface.createTable("product_meta_objects", {
      id: uuid,
      productId: { type: Sequelize.UUID, allowNull: false, references: { model: "products", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      metaObjectId: { type: Sequelize.UUID, allowNull: false, references: { model: "meta_objects", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      sortOrder: { type: Sequelize.INTEGER, defaultValue: 0 },
      values: { type: Sequelize.TEXT, allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex("product_meta_objects", ["productId", "metaObjectId"], { unique: true });

    // --- product_media ---
    await queryInterface.createTable("product_media", {
      id: uuid,
      productId: { type: Sequelize.UUID, allowNull: false, references: { model: "products", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      mediaId: { type: Sequelize.UUID, allowNull: false, references: { model: "media", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      sortOrder: { type: Sequelize.INTEGER, defaultValue: 0 },
      ...ts,
    });
    await queryInterface.addIndex("product_media", ["productId", "mediaId"], { unique: true });

    // --- collection_media ---
    await queryInterface.createTable("collection_media", {
      id: uuid,
      collectionId: { type: Sequelize.UUID, allowNull: false, references: { model: "collections", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      mediaId: { type: Sequelize.UUID, allowNull: false, references: { model: "media", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      sortOrder: { type: Sequelize.INTEGER, defaultValue: 0 },
      ...ts,
    });
    await queryInterface.addIndex("collection_media", ["collectionId", "mediaId"], { unique: true });

    // --- carts ---
    await queryInterface.createTable("carts", {
      id: uuid,
      userId: { type: Sequelize.UUID, allowNull: true, references: { model: "users", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      sessionId: { type: Sequelize.STRING, allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex("carts", ["userId"]);
    await queryInterface.addIndex("carts", ["sessionId"]);

    // --- orders ---
    await queryInterface.createTable("orders", {
      id: uuid,
      orderNumber: { type: Sequelize.INTEGER, allowNull: true, unique: true },
      userId: { type: Sequelize.UUID, allowNull: true, references: { model: "users", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      sessionId: { type: Sequelize.STRING, allowNull: true },
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
      personType: { type: Sequelize.ENUM("private", "legal"), allowNull: false, defaultValue: "private" },
      companyName: { type: Sequelize.STRING, allowNull: true },
      companyOib: { type: Sequelize.STRING(11), allowNull: true },
      paymentStatus: { type: Sequelize.ENUM("pending", "paid", "failed", "partially_refunded", "refunded", "voided"), allowNull: false, defaultValue: "pending" },
      fulfillmentStatus: { type: Sequelize.ENUM("pending", "processing", "shipped", "delivered", "refund_requested", "refunded", "cancelled", "returned"), allowNull: false, defaultValue: "pending" },
      source: { type: Sequelize.ENUM("cart", "event"), allowNull: false, defaultValue: "cart" },
      total: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      currency: { type: Sequelize.STRING, allowNull: false, defaultValue: "EUR" },
      stripePaymentIntentId: { type: Sequelize.STRING, allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex("orders", ["userId"]);
    await queryInterface.addIndex("orders", ["sessionId"]);
    await queryInterface.addIndex("orders", ["paymentStatus"]);
    await queryInterface.addIndex("orders", ["fulfillmentStatus"]);
    await queryInterface.addIndex("orders", ["stripePaymentIntentId"]);

    // --- events ---
    await queryInterface.createTable("events", {
      id: uuid,
      productId: { type: Sequelize.UUID, allowNull: false, references: { model: "products", key: "id" }, onUpdate: "CASCADE", onDelete: "RESTRICT" },
      productVariantId: { type: Sequelize.UUID, allowNull: true, references: { model: "product_variants", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      startDate: { type: Sequelize.DATEONLY, allowNull: false },
      startTime: { type: Sequelize.TIME, allowNull: true },
      durationMinutes: { type: Sequelize.INTEGER, allowNull: true },
      location: { type: Sequelize.STRING, allowNull: true },
      capacity: { type: Sequelize.INTEGER, allowNull: true },
      isOnline: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      timezone: { type: Sequelize.STRING, allowNull: true },
      eventStatus: { type: Sequelize.ENUM("active", "cancelled", "orphaned"), allowNull: false, defaultValue: "active" },
      ...ts,
    });

    // --- admin_zoom_accounts ---
    await queryInterface.createTable("admin_zoom_accounts", {
      id: uuid,
      userId: { type: Sequelize.UUID, allowNull: false, unique: true, references: { model: "users", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      zoomUserId: { type: Sequelize.STRING, allowNull: false },
      accessToken: { type: Sequelize.TEXT, allowNull: false },
      refreshToken: { type: Sequelize.TEXT, allowNull: true },
      tokenExpiresAt: { type: Sequelize.DATE, allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex("admin_zoom_accounts", ["zoomUserId"]);

    // --- event_meetings ---
    await queryInterface.createTable("event_meetings", {
      id: uuid,
      eventId: { type: Sequelize.UUID, allowNull: false, references: { model: "events", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      zoomMeetingId: { type: Sequelize.STRING, allowNull: false },
      zoomHostAccountId: { type: Sequelize.UUID, allowNull: true, references: { model: "admin_zoom_accounts", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      ...ts,
    });
    await queryInterface.addIndex("event_meetings", ["eventId"], { unique: true });
    await queryInterface.addIndex("event_meetings", ["zoomMeetingId"]);

    // --- cart_lines ---
    await queryInterface.createTable("cart_lines", {
      id: uuid,
      cartId: { type: Sequelize.UUID, allowNull: false, references: { model: "carts", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      productVariantId: { type: Sequelize.UUID, allowNull: false, references: { model: "product_variants", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      quantity: { type: Sequelize.INTEGER, defaultValue: 1 },
      ...ts,
    });
    await queryInterface.addIndex("cart_lines", ["cartId", "productVariantId"], { unique: true });

    // --- order_lines ---
    await queryInterface.createTable("order_lines", {
      id: uuid,
      orderId: { type: Sequelize.UUID, allowNull: false, references: { model: "orders", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      productVariantId: { type: Sequelize.UUID, allowNull: true, references: { model: "product_variants", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      title: { type: Sequelize.STRING(255), allowNull: true },
      price: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      quantity: { type: Sequelize.INTEGER, defaultValue: 1 },
      eventId: { type: Sequelize.UUID, allowNull: true, references: { model: "events", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      vatRate: { type: Sequelize.INTEGER, allowNull: true, defaultValue: null },
      sku: { type: Sequelize.STRING(255), allowNull: true, defaultValue: null },
      kpd: { type: Sequelize.STRING(20), allowNull: true, defaultValue: null },
      unit: { type: Sequelize.STRING(20), allowNull: true, defaultValue: null },
      stripeTaxRateId: { type: Sequelize.STRING, allowNull: true, defaultValue: null },
      ...ts,
    });
    await queryInterface.addIndex("order_lines", ["orderId"]);
    await queryInterface.addIndex("order_lines", ["eventId"]);

    // --- order_attendees ---
    await queryInterface.createTable("order_attendees", {
      id: uuid,
      orderId: { type: Sequelize.UUID, allowNull: false, references: { model: "orders", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      orderLineId: { type: Sequelize.UUID, allowNull: false, references: { model: "order_lines", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      eventId: { type: Sequelize.UUID, allowNull: false, references: { model: "events", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      attendeeIndex: { type: Sequelize.INTEGER, allowNull: false },
      email: { type: Sequelize.STRING, allowNull: false },
      forename: { type: Sequelize.STRING, allowNull: true },
      surname: { type: Sequelize.STRING, allowNull: true },
      userId: { type: Sequelize.UUID, allowNull: true, references: { model: "users", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      ...ts,
    });
    await queryInterface.addIndex("order_attendees", ["orderId"]);
    await queryInterface.addIndex("order_attendees", ["orderLineId"]);
    await queryInterface.addIndex("order_attendees", ["eventId"]);
    await queryInterface.addIndex("order_attendees", ["orderLineId", "attendeeIndex"], { unique: true });

    // --- registrations ---
    await queryInterface.createTable("registrations", {
      id: uuid,
      eventId: { type: Sequelize.UUID, allowNull: false, references: { model: "events", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      orderId: { type: Sequelize.UUID, allowNull: false, references: { model: "orders", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      orderLineId: { type: Sequelize.UUID, allowNull: false, references: { model: "order_lines", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      orderAttendeeId: { type: Sequelize.UUID, allowNull: false, references: { model: "order_attendees", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      userId: { type: Sequelize.UUID, allowNull: true, references: { model: "users", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      email: { type: Sequelize.STRING, allowNull: false },
      forename: { type: Sequelize.STRING, allowNull: true },
      surname: { type: Sequelize.STRING, allowNull: true },
      status: { type: Sequelize.ENUM("registered", "cancelled"), allowNull: false, defaultValue: "registered" },
      zoomRegistrantId: { type: Sequelize.STRING, allowNull: true },
      deletedAt: { type: Sequelize.DATE, allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex("registrations", ["eventId"]);
    await queryInterface.addIndex("registrations", ["orderId"]);
    await queryInterface.addIndex("registrations", ["orderLineId"]);
    await queryInterface.addIndex("registrations", ["orderAttendeeId"], { unique: true });

    // --- transactions ---
    await queryInterface.createTable("transactions", {
      id: uuid,
      orderId: { type: Sequelize.UUID, allowNull: false, references: { model: "orders", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      currency: { type: Sequelize.STRING, allowNull: false, defaultValue: "EUR" },
      status: { type: Sequelize.ENUM("pending", "success", "failed", "refunded"), allowNull: false, defaultValue: "pending" },
      gatewayReference: { type: Sequelize.STRING, allowNull: true },
      metadata: { type: Sequelize.TEXT, allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex("transactions", ["orderId"]);
    await queryInterface.addIndex("transactions", ["gatewayReference"], { name: "transactions_gateway_reference" });

    // --- refund_transactions ---
    await queryInterface.createTable("refund_transactions", {
      id: uuid,
      orderId: { type: Sequelize.UUID, allowNull: false, references: { model: "orders", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      refundRequestId: { type: Sequelize.UUID, allowNull: true },
      paymentTransactionId: { type: Sequelize.UUID, allowNull: true, references: { model: "transactions", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      stripeRefundId: { type: Sequelize.STRING, allowNull: true },
      paymentIntentId: { type: Sequelize.STRING, allowNull: true },
      amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      currency: { type: Sequelize.STRING, allowNull: false, defaultValue: "EUR" },
      status: { type: Sequelize.ENUM("pending", "succeeded", "failed", "cancelled"), allowNull: false, defaultValue: "pending" },
      scopeType: { type: Sequelize.ENUM("full_order", "line_quantity", "event_attendee"), allowNull: false, defaultValue: "full_order" },
      orderLineId: { type: Sequelize.UUID, allowNull: true, references: { model: "order_lines", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      registrationId: { type: Sequelize.UUID, allowNull: true, references: { model: "registrations", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      orderAttendeeId: { type: Sequelize.UUID, allowNull: true, references: { model: "order_attendees", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      refundedQuantity: { type: Sequelize.INTEGER, allowNull: true },
      reason: { type: Sequelize.TEXT, allowNull: true },
      metadata: { type: Sequelize.TEXT, allowNull: true },
      createdByUserId: { type: Sequelize.UUID, allowNull: true, references: { model: "users", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      processedAt: { type: Sequelize.DATE, allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex("refund_transactions", ["orderId"]);
    await queryInterface.addIndex("refund_transactions", ["status"]);
    await queryInterface.addIndex("refund_transactions", ["stripeRefundId"], { unique: true });
    await queryInterface.addIndex("refund_transactions", ["refundRequestId"]);
    await queryInterface.addIndex("refund_transactions", ["paymentTransactionId"]);
    await queryInterface.addIndex("refund_transactions", ["orderLineId"]);
    await queryInterface.addIndex("refund_transactions", ["registrationId"]);
    await queryInterface.addIndex("refund_transactions", ["orderAttendeeId"]);

    // --- refund_requests ---
    await queryInterface.createTable("refund_requests", {
      id: uuid,
      orderId: { type: Sequelize.UUID, allowNull: false, references: { model: "orders", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      status: { type: Sequelize.ENUM("pending", "approved", "rejected"), allowNull: false, defaultValue: "pending" },
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
    await queryInterface.addConstraint("refund_transactions", {
      fields: ["refundRequestId"],
      type: "foreign key",
      references: { table: "refund_requests", field: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
      name: "refund_transactions_refund_request_id_fkey",
    });

    // --- payment_methods ---
    await queryInterface.createTable("payment_methods", {
      id: uuid,
      userId: { type: Sequelize.UUID, allowNull: false, references: { model: "users", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      type: { type: Sequelize.STRING, allowNull: false },
      stripePaymentMethodId: { type: Sequelize.STRING, allowNull: false },
      last4: { type: Sequelize.STRING(4), allowNull: true },
      brand: { type: Sequelize.STRING, allowNull: true },
      expiryMonth: { type: Sequelize.INTEGER, allowNull: true },
      expiryYear: { type: Sequelize.INTEGER, allowNull: true },
      isDefault: { type: Sequelize.BOOLEAN, defaultValue: false },
      ...ts,
    });
    await queryInterface.addIndex("payment_methods", ["userId"]);

    // --- store_settings (key-value merchant / app options) ---
    await queryInterface.createTable("store_settings", {
      key: { type: Sequelize.STRING(190), allowNull: false, primaryKey: true },
      value: { type: Sequelize.TEXT, allowNull: true },
      ...ts,
    });

    // --- processed_stripe_events ---
    await queryInterface.createTable("processed_stripe_events", {
      eventId: { type: Sequelize.STRING, primaryKey: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
    });

    // --- discounts ---
    await queryInterface.createTable("discounts", {
      id: uuid,
      code: { type: Sequelize.STRING, allowNull: false, unique: true },
      type: { type: Sequelize.ENUM("percentage", "fixed_amount"), allowNull: false },
      value: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      minOrderAmount: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
      maxUses: { type: Sequelize.INTEGER, allowNull: true },
      usedCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      validFrom: { type: Sequelize.DATEONLY, allowNull: true },
      validUntil: { type: Sequelize.DATEONLY, allowNull: true },
      active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      description: { type: Sequelize.TEXT, allowNull: true },
      // Controls which order lines the discount applies to: all | events | products
      applicableTo: { type: Sequelize.ENUM("all", "events", "products"), allowNull: false, defaultValue: "all" },
      ...ts,
    });

    // --- order_discounts (snapshot of applied discount at order time) ---
    await queryInterface.createTable("order_discounts", {
      id: uuid,
      orderId: { type: Sequelize.UUID, allowNull: false, references: { model: "orders", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      discountId: { type: Sequelize.UUID, allowNull: true, references: { model: "discounts", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      code: { type: Sequelize.STRING, allowNull: false },
      type: { type: Sequelize.ENUM("percentage", "fixed_amount"), allowNull: false },
      value: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      amountDeducted: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      // Snapshotted at order time for audit — matches discount.applicableTo at redemption.
      applicableTo: { type: Sequelize.ENUM("all", "events", "products"), allowNull: false, defaultValue: "all" },
      // Pre-computed VAT distribution array, consumed by stripe.gateway to create
      // correctly VAT-attributed negative InvoiceItems on the Stripe invoice.
      // Shape: Array<{ vatRate: number|null, stripeTaxRateId: string|null, amount: number }>
      vatDistribution: { type: Sequelize.JSON, allowNull: false },
      ...ts,
    });
    await queryInterface.addIndex("order_discounts", ["orderId"]);

    // --- order_histories (append-only audit log of order lifecycle events) ---
    await queryInterface.createTable("order_histories", {
      id: uuid,
      orderId: { type: Sequelize.UUID, allowNull: false, references: { model: "orders", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      event: {
        type: Sequelize.ENUM(
          "payment_finalized",
          "payment_refunded",
          "partial_refund_issued",
          "confirmation_email_sent",
          "zoom_sync_completed",
          "fulfillment_status_changed",
          "refund_requested",
          "refund_request_approved",
          "refund_request_rejected",
          "order_cancelled",
          "order_updated",
          "post_commit_retried"
        ),
        allowNull: false,
      },
      // true = action succeeded, false = action failed, null = informational
      success: { type: Sequelize.BOOLEAN, allowNull: true },
      // Free-form context: error messages, changed fields, Stripe IDs, counts, etc.
      meta: { type: Sequelize.JSON, allowNull: true },
      // Admin who triggered this (null for system-generated events)
      actorId: { type: Sequelize.UUID, allowNull: true, references: { model: "users", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      // No updatedAt — append-only table
    });
    await queryInterface.addIndex("order_histories", ["orderId"]);
    await queryInterface.addIndex("order_histories", ["event"]);
    await queryInterface.addIndex("order_histories", ["createdAt"]);
  },

  async down(queryInterface) {
    // Drop in reverse dependency order
    await queryInterface.dropTable("order_histories");
    await queryInterface.dropTable("order_discounts");
    await queryInterface.dropTable("discounts");
    await queryInterface.dropTable("processed_stripe_events");
    await queryInterface.dropTable("store_settings");
    await queryInterface.dropTable("payment_methods");
    await queryInterface.dropTable("refund_transactions");
    await queryInterface.dropTable("refund_requests");
    await queryInterface.dropTable("transactions");
    await queryInterface.dropTable("registrations");
    await queryInterface.dropTable("order_attendees");
    await queryInterface.dropTable("order_lines");
    await queryInterface.dropTable("cart_lines");
    await queryInterface.dropTable("event_meetings");
    await queryInterface.dropTable("admin_zoom_accounts");
    await queryInterface.dropTable("events");
    await queryInterface.dropTable("orders");
    await queryInterface.dropTable("carts");
    await queryInterface.dropTable("collection_media");
    await queryInterface.dropTable("product_media");
    await queryInterface.dropTable("product_meta_objects");
    await queryInterface.dropTable("product_collections");
    await queryInterface.dropTable("product_tags");
    await queryInterface.dropTable("product_prices");
    await queryInterface.dropTable("product_variants");
    await queryInterface.dropTable("products");
    await queryInterface.dropTable("meta_objects");
    await queryInterface.dropTable("collections");
    await queryInterface.dropTable("media");
    await queryInterface.dropTable("tags");
    await queryInterface.dropTable("tax_rates");
    await queryInterface.dropTable("product_categories");
    await queryInterface.dropTable("product_types");
    await queryInterface.dropTable("posts");
    await queryInterface.dropTable("menu_items");
    await queryInterface.dropTable("menus");
    await queryInterface.dropTable("addresses");
    await queryInterface.dropTable("users");
  },
};
