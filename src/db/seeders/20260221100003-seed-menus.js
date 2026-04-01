"use strict";

const crypto = require("crypto");

/** Seeds default menus (header, footer, admin-sidebar) and their menu items. */
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const now = new Date();
    const Q = sequelize.QueryTypes.SELECT;

    async function getMenuIdBySlug(slug) {
      const rows = await sequelize.query(`SELECT id FROM menus WHERE slug = ? LIMIT 1`, {
        replacements: [slug],
        type: Q,
      });
      return rows && rows.length ? rows[0].id : null;
    }

    let headerId = await getMenuIdBySlug("header");
    let footerId = await getMenuIdBySlug("footer");
    let adminSidebarId = await getMenuIdBySlug("admin-sidebar");

    const newMenus = [];
    if (!headerId) {
      headerId = crypto.randomUUID();
      newMenus.push({ id: headerId, slug: "header", name: "Main Navigation", description: "Primary navigation in the header", active: true, order: 0, createdAt: now, updatedAt: now });
    }
    if (!footerId) {
      footerId = crypto.randomUUID();
      newMenus.push({ id: footerId, slug: "footer", name: "Footer Links", description: "Links in the footer", active: true, order: 1, createdAt: now, updatedAt: now });
    }
    if (!adminSidebarId) {
      adminSidebarId = crypto.randomUUID();
      newMenus.push({ id: adminSidebarId, slug: "admin-sidebar", name: "Admin Sidebar", description: "Admin panel sidebar navigation", active: true, order: 2, createdAt: now, updatedAt: now });
    }
    if (newMenus.length) {
      await queryInterface.bulkInsert("menus", newMenus);
    }

    const I = {
      dash: crypto.randomUUID(),
      users: crypto.randomUUID(),
      events: crypto.randomUUID(),
      products: crypto.randomUUID(),
      orders: crypto.randomUUID(),
      collections: crypto.randomUUID(),
      media: crypto.randomUUID(),
      blog: crypto.randomUUID(),
      menus: crypto.randomUUID(),
      settings: crypto.randomUUID(),
      logout: crypto.randomUUID(),
      evWeb: crypto.randomUUID(),
      evSem: crypto.randomUUID(),
      evClass: crypto.randomUUID(),
      prPt: crypto.randomUUID(),
      prPc: crypto.randomUUID(),
      prTax: crypto.randomUUID(),
      prMeta: crypto.randomUUID(),
      orRef: crypto.randomUUID(),
      meMi: crypto.randomUUID(),
      seZoom: crypto.randomUUID(),
    };

    const row = (id, label, url, order, parentId, method) => ({
      id,
      menuId: adminSidebarId,
      label,
      url,
      order,
      active: true,
      parentId: parentId || null,
      icon: null,
      target: null,
      method: method || "GET",
      slug: null,
      cssClass: null,
      createdAt: now,
      updatedAt: now,
    });

    const adminParents = [
      row(I.dash, "Dashboard", "/", 0, null),
      row(I.users, "Users", "/users", 10, null),
      row(I.events, "Events", "/events", 20, null),
      row(I.products, "Products", "/products", 30, null),
      row(I.orders, "Orders", "/orders", 40, null),
      row(I.collections, "Collections", "/collections", 50, null),
      row(I.media, "Media", "/media", 60, null),
      row(I.blog, "Blog", "/blog", 70, null),
      row(I.menus, "Menus", "/menus", 80, null),
      row(I.settings, "Settings", "/settings", 85, null),
      row(I.logout, "Logout", "/auth/logout", 100, null, "POST"),
    ];

    const adminChildren = [
      row(I.evWeb, "Webinars", "/webinars", 0, I.events),
      row(I.evSem, "Seminars", "/seminars", 1, I.events),
      row(I.evClass, "Classrooms", "/classrooms", 2, I.events),
      row(I.prPt, "Product Types", "/product-types", 0, I.products),
      row(I.prPc, "Product Categories", "/product-categories", 1, I.products),
      row(I.prTax, "Tax Rates", "/tax-rates", 2, I.products),
      row(I.prMeta, "Meta Objects", "/meta-objects", 3, I.products),
      row(I.orRef, "Refund Requests", "/refund-requests", 0, I.orders),
      row(I.meMi, "Menu Items", "/menu-items", 0, I.menus),
      row(I.seZoom, "Connect Zoom", "/zoom/connect", 0, I.settings),
    ];

    await sequelize.query(`DELETE FROM menu_items WHERE menuId = ?`, { replacements: [adminSidebarId] });
    await queryInterface.bulkInsert("menu_items", adminParents);
    await queryInterface.bulkInsert("menu_items", adminChildren);

    const headerCountRows = await sequelize.query(
      `SELECT COUNT(*) AS c FROM menu_items WHERE menuId = ?`,
      { replacements: [headerId], type: Q }
    );
    const headerItemCount = headerCountRows && headerCountRows.length ? Number(headerCountRows[0].c) : 0;

    if (headerItemCount === 0) {
      const headerItems = [
        { label: "Products", url: "/products", order: 0 },
        { label: "Webinars", url: "/webinars", order: 10 },
        { label: "Seminars", url: "/seminars", order: 20 },
        { label: "Classrooms", url: "/classrooms", order: 30 },
        { label: "Blog", url: "/blog", order: 40 },
        { label: "Contact", url: "/contact", order: 50 },
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
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("menu_items", null, {});
    await queryInterface.bulkDelete("menus", null, {});
  },
};
