"use strict";

const crypto = require("crypto");
const { Menu, MenuItem } = require("../../models");

/** Ensures admin-sidebar has "Refund Requests" link and items are in the desired order. */
const ADMIN_SIDEBAR_ITEMS = [
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
  { label: "Logout", url: "/auth/logout", order: 100 },
];

module.exports = {
  async up() {
    const menu = await Menu.findOne({ where: { slug: "admin-sidebar" } });
    if (!menu) return;

    const items = await MenuItem.findAll({ where: { menuId: menu.id }, raw: true });
    const byUrl = new Map((items || []).map((i) => [i.url, i]));

    for (const desired of ADMIN_SIDEBAR_ITEMS) {
      const existing = byUrl.get(desired.url);
      if (existing) {
        await MenuItem.update(
          { order: desired.order, label: desired.label },
          { where: { id: existing.id } }
        );
      } else if (desired.url === "/refund-requests") {
        await MenuItem.create({
          id: crypto.randomUUID(),
          menuId: menu.id,
          label: desired.label,
          url: desired.url,
          order: desired.order,
          active: true,
          parentId: null,
          method: "GET",
        });
      }
    }
  },

  async down() {
    const menu = await Menu.findOne({ where: { slug: "admin-sidebar" } });
    if (!menu) return;
    await MenuItem.destroy({ where: { menuId: menu.id, url: "/refund-requests" } });
  },
};
