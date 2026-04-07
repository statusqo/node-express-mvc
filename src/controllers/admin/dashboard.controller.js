// src/controllers/admin/dashboard.controller.js
const adminService = require("../../services/admin.service");

module.exports = {
  async index(req, res) {
    const stats = await adminService.getDashboardStats(req.user?.id);

    res.render("admin/dashboard", {
      title: "Admin Dashboard",
      stats,
    });
  },
};