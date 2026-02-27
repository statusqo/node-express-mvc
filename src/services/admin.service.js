const userRepo = require("../repos/user.repo");
const productRepo = require("../repos/product.repo");
const collectionRepo = require("../repos/collection.repo");
const metaObjectRepo = require("../repos/metaObject.repo");
const postRepo = require("../repos/post.repo");
const orderRepo = require("../repos/order.repo");
const { Product, ProductType, RefundRequest, AdminZoomAccount } = require("../models");

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
      Product.count({ include: [{ model: ProductType, as: "ProductType", where: { slug: "webinar" }, required: true }], distinct: true }),
      Product.count({ include: [{ model: ProductType, as: "ProductType", where: { slug: "seminar" }, required: true }], distinct: true }),
      Product.count({ include: [{ model: ProductType, as: "ProductType", where: { slug: "classroom" }, required: true }], distinct: true }),
      RefundRequest.count({ where: { status: "pending" } }),
    ]);

    const zoomConnected = userId
      ? !!(await AdminZoomAccount.findOne({ where: { userId } }))
      : false;

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
