const userRepo = require("../repos/user.repo");
const productRepo = require("../repos/product.repo");
const collectionRepo = require("../repos/collection.repo");
const metaObjectRepo = require("../repos/metaObject.repo");
const postRepo = require("../repos/post.repo");
const orderRepo = require("../repos/order.repo");
const refundRequestRepo = require("../repos/refundRequest.repo");
const adminZoomAccountRepo = require("../repos/adminZoomAccount.repo");
const config = require("../config");

module.exports = {
  async getDashboardStats(userId) {
    const [
      userCount, productCount, collectionCount, metaObjectCount, postCount, orderCount,
      webinarCount, seminarCount, classroomCount, pendingRefundCount,
    ] = await Promise.all([
      userRepo.count(),
      productRepo.count(),
      collectionRepo.count(),
      metaObjectRepo.count(),
      postRepo.count(),
      orderRepo.count(),
      productRepo.countByCategorySlug("webinars"),
      productRepo.countByTypeSlug("seminar"),
      productRepo.countByCategorySlug("classrooms"),
      refundRequestRepo.countPending(),
    ]);

    const zoomAccount = userId
      ? await adminZoomAccountRepo.findByUserId(userId)
      : null;
    const zoomConnected = (() => {
      if (!zoomAccount) return false;
      if (!config.zoom || !config.zoom.clientId || !config.zoom.clientSecret) return false;
      // Token is usable if it hasn't expired, or a refresh token exists to renew it
      const expiresAt = zoomAccount.tokenExpiresAt ? new Date(zoomAccount.tokenExpiresAt).getTime() : null;
      const tokenExpired = expiresAt !== null && expiresAt <= Date.now();
      if (tokenExpired && !zoomAccount.refreshToken) return false;
      return true;
    })();

    return {
      users: userCount,
      products: productCount,
      collections: collectionCount,
      metaObjects: metaObjectCount,
      posts: postCount,
      orders: orderCount,
      webinars: webinarCount,
      seminars: seminarCount,
      classrooms: classroomCount,
      pendingRefunds: pendingRefundCount,
      zoomConnected,
    };
  },
};
