"use strict";

const crypto = require("crypto");

/** Seeds default menus (header, footer, admin-sidebar) and their menu items. */
module.exports = {
  async up(queryInterface) {
    const existingMenus = await queryInterface.sequelize.query(
      `SELECT id FROM menus WHERE slug = 'header' LIMIT 1`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    if (existingMenus && existingMenus.length > 0) return;

    const now = new Date();
    const headerId = crypto.randomUUID();
    const footerId = crypto.randomUUID();
    const adminSidebarId = crypto.randomUUID();

    await queryInterface.bulkInsert("menus", [
      { id: headerId, slug: "header", name: "Main Navigation", description: "Primary navigation in the header", active: true, order: 0, createdAt: now, updatedAt: now },
      { id: footerId, slug: "footer", name: "Footer Links", description: "Links in the footer", active: true, order: 1, createdAt: now, updatedAt: now },
      { id: adminSidebarId, slug: "admin-sidebar", name: "Admin Sidebar", description: "Admin panel sidebar navigation", active: true, order: 2, createdAt: now, updatedAt: now },
    ]);

    const adminSidebarItems = [
      { label: "Dashboard", url: "/", order: 0 },
      { label: "Users", url: "/users", order: 10 },
      { label: "Orders", url: "/orders", order: 15 },
      { label: "Refund Requests", url: "/refund-requests", order: 17 },
      { label: "Products", url: "/products", order: 20 },
      { label: "Product Types", url: "/product-types", order: 25 },
      { label: "Collections", url: "/collections", order: 30 },
      { label: "Webinars", url: "/webinars", order: 32 },
      { label: "Seminars", url: "/seminars", order: 34 },
      { label: "Classrooms", url: "/classrooms", order: 36 },
      { label: "Media", url: "/media", order: 40 },
      { label: "Meta Objects", url: "/meta-objects", order: 50 },
      { label: "Blog", url: "/blog", order: 60 },
      { label: "Menus", url: "/menus", order: 70 },
      { label: "Logout", url: "/auth/logout", order: 100, method: "POST" },
    ];
    for (const item of adminSidebarItems) {
      await queryInterface.bulkInsert("menu_items", [{
        id: crypto.randomUUID(),
        menuId: adminSidebarId,
        label: item.label,
        url: item.url,
        order: item.order,
        active: true,
        parentId: null,
        icon: null,
        target: null,
        method: item.method || "GET",
        slug: null,
        cssClass: null,
        createdAt: now,
        updatedAt: now,
      }]);
    }

    const headerItems = [
      { label: "Products", url: "/products", order: 0 },
      { label: "Collections", url: "/collections", order: 10 },
      { label: "Blog", url: "/blog", order: 20 },
      { label: "Contact", url: "/contact", order: 30 },
      { label: "Account", url: "/account", order: 90, icon: "fa-user", slug: "account" },
      { label: "Cart", url: "/cart", order: 100, icon: "fa-cart-shopping", slug: "cart" },
    ];
    for (const item of headerItems) {
      await queryInterface.bulkInsert("menu_items", [{
        id: crypto.randomUUID(),
        menuId: headerId,
        label: item.label,
        url: item.url,
        order: item.order,
        active: true,
        parentId: null,
        icon: item.icon || null,
        target: null,
        method: "GET",
        slug: item.slug || null,
        cssClass: null,
        createdAt: now,
        updatedAt: now,
      }]);
    }

    await queryInterface.bulkInsert("menu_items", [{
      id: crypto.randomUUID(),
      menuId: footerId,
      label: "Contact",
      url: "/contact",
      order: 0,
      active: true,
      parentId: null,
      icon: null,
      target: null,
      method: "GET",
      slug: null,
      cssClass: null,
      createdAt: now,
      updatedAt: now,
    }]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("menu_items", null, {});
    await queryInterface.bulkDelete("menus", null, {});
  },
};
