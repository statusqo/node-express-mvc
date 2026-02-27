// src/controllers/admin/dashboard.controller.js
const adminService = require("../../services/admin.service");

module.exports = {
  async index(req, res) {
    // asyncHandler will catch errors, no need for try/catch unless we want specific logging
    // Global error handler already logs errors.
    
    const stats = await adminService.getDashboardStats(req.user?.id);

    res.render("admin/dashboard", {
      title: "Admin Dashboard",
      stats,
    });
  },
};
