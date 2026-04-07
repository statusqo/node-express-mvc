const userRepo           = require("../repos/user.repo");
const productRepo        = require("../repos/product.repo");
const collectionRepo     = require("../repos/collection.repo");
const orderRepo          = require("../repos/order.repo");
const refundRequestRepo  = require("../repos/refundRequest.repo");
const adminZoomAccountRepo = require("../repos/adminZoomAccount.repo");
const dashboardRepo      = require("../repos/dashboard.repo");
const config             = require("../config");

function calcDelta(current, previous) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

module.exports = {
  async getDashboardStats(userId) {
    // ── Core counts (sidebar KPI labels) ─────────────────────────────
    const [
      userCount,
      productCount,
      collectionCount,
      orderCount,
      webinarCount,
      seminarCount,
      classroomCount,
      pendingRefundCount,
    ] = await Promise.all([
      userRepo.count(),
      productRepo.count(),
      collectionRepo.count(),
      orderRepo.count(),
      productRepo.countByCategorySlug("webinars"),
      productRepo.countByTypeSlug("seminar"),
      productRepo.countByCategorySlug("classrooms"),
      refundRequestRepo.countPending(),
    ]);

    // ── Dashboard metrics (parallel) ──────────────────────────────────
    const [
      monthlyRevenue,
      netRevenueThisMonth,
      monthlyOrders,
      monthlyUsers,
      actionableOrders,
    ] = await Promise.all([
      dashboardRepo.getMonthlyRevenue(),
      dashboardRepo.getNetRevenueThisMonth(),
      dashboardRepo.getMonthlyOrders(),
      dashboardRepo.getMonthlyUsers(),
      dashboardRepo.getActionableOrders(8),
    ]);

    // ── Zoom connection status ────────────────────────────────────────
    const zoomAccount = userId
      ? await adminZoomAccountRepo.findByUserId(userId)
      : null;

    const zoomConnected = (() => {
      if (!zoomAccount) return false;
      if (!config.zoom || !config.zoom.clientId || !config.zoom.clientSecret) return false;
      const expiresAt   = zoomAccount.tokenExpiresAt ? new Date(zoomAccount.tokenExpiresAt).getTime() : null;
      const tokenExpired = expiresAt !== null && expiresAt <= Date.now();
      if (tokenExpired && !zoomAccount.refreshToken) return false;
      return true;
    })();

    return {
      // Sidebar counts
      users:         userCount,
      products:      productCount,
      collections:   collectionCount,
      orders:        orderCount,
      webinars:      webinarCount,
      seminars:      seminarCount,
      classrooms:    classroomCount,
      pendingRefunds: pendingRefundCount,
      zoomConnected,

      // Revenue KPIs
      revenueThisMonth:  monthlyRevenue.thisMonth,
      revenuePrevMonth:  monthlyRevenue.prevMonth,
      revenueDelta:      calcDelta(monthlyRevenue.thisMonth, monthlyRevenue.prevMonth),
      netRevenueThisMonth,

      // Order KPIs
      ordersThisMonth:  monthlyOrders.thisMonth,
      ordersPrevMonth:  monthlyOrders.prevMonth,
      ordersDelta:      calcDelta(monthlyOrders.thisMonth, monthlyOrders.prevMonth),

      // User KPIs
      newUsersThisMonth: monthlyUsers.thisMonth,
      newUsersPrevMonth: monthlyUsers.prevMonth,
      newUsersDelta:     calcDelta(monthlyUsers.thisMonth, monthlyUsers.prevMonth),

      // Panels
      actionableOrders,
    };
  },
};