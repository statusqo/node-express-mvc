// src/routes/admin/index.js — Full CRUD for Users, Products, Collections, Blog
const express = require("express");
const asyncHandler = require("../../utils/asyncHandler");
const dashboardController = require("../../controllers/admin/dashboard.controller");
const usersController = require("../../controllers/admin/users.controller");
const productsController = require("../../controllers/admin/products.controller");
const collectionsController = require("../../controllers/admin/collections.controller");
const metaObjectsController = require("../../controllers/admin/metaObjects.controller");
const mediaController = require("../../controllers/admin/media.controller");
const productTypesController = require("../../controllers/admin/productTypes.controller");
const productCategoriesController = require("../../controllers/admin/productCategories.controller");
const taxRatesController = require("../../controllers/admin/taxRates.controller");
const postsController = require("../../controllers/admin/posts.controller");
const menusController = require("../../controllers/admin/menus.controller");
const menuItemsController = require("../../controllers/admin/menuItems.controller");
const ordersController = require("../../controllers/admin/orders.controller");
const refundRequestsController = require("../../controllers/admin/refundRequests.controller");
const webinarsRoutes = require("./webinars.routes");
const seminarsRoutes = require("./seminars.routes");
const classroomsRoutes = require("./classrooms.routes");
const zoomController = require("../../controllers/admin/zoom.controller");
const { requireAuth } = require("../../middlewares/auth.middleware");
const { uploadMedia } = require("../../middlewares/uploadMedia.middleware");

const router = express.Router();

router.use((req, res, next) => {
  const prefix = req.baseUrl || "";
  req.adminPrefix = prefix;
  res.locals.adminPrefix = prefix;
  const path = req.path || "";
  const segments = path.split("/").filter(Boolean);
  const isDashboard = segments.length === 0;
  const capitalize = (s) => (s && s[0]) ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;
  res.locals.adminIsDashboard = isDashboard;
  res.locals.adminSlug = isDashboard
    ? "Dashboard"
    : "home/" + segments.map(capitalize).join("/");
  const lastSegment = segments[segments.length - 1];
  const isEditPath = lastSegment === "edit" && segments.length >= 3;
  const isNewPath = lastSegment === "new" || lastSegment === "new-admin";
  const isEventsPath = lastSegment === "events" && segments.length >= 3;
  const dropCount = isEditPath ? 2 : isEventsPath ? 2 : isNewPath || segments.length > 1 ? 1 : 0;
  res.locals.adminBackUrl = segments.length > 0 && dropCount > 0
    ? prefix + "/" + segments.slice(0, -dropCount).join("/")
    : segments.length === 1
      ? prefix + "/"
      : null;
  next();
});

router.use(requireAuth);

// Uploads are served from main app at /uploads (same origin as /admin)

router.get(["/", ""], asyncHandler(dashboardController.index));

// Zoom OAuth (connect account for online events)
router.get("/zoom/connect", asyncHandler(zoomController.connect));
router.get("/zoom/callback", asyncHandler(zoomController.callback));

// Users CRUD
// Orders (admin list with filters)
router.get("/orders", asyncHandler(ordersController.index));
router.get("/refund-requests", asyncHandler(refundRequestsController.index));
router.get("/orders/:id/edit", asyncHandler(ordersController.editForm));
router.post("/orders/:id/edit", asyncHandler(ordersController.update));
router.post("/orders/:id/refund-request/:requestId/approve", asyncHandler(ordersController.approveRefundRequest));
router.post("/orders/:id/refund-request/:requestId/reject", asyncHandler(ordersController.rejectRefundRequest));
// Users CRUD
router.get("/users", asyncHandler(usersController.index));
router.get("/users/new", asyncHandler(usersController.newForm));
router.get("/users/new-admin", asyncHandler(usersController.newAdminForm));
router.post("/users/new", asyncHandler(usersController.create));
router.get("/users/:id/edit", asyncHandler(usersController.editForm));
router.post("/users/:id/edit", asyncHandler(usersController.update));
router.post("/users/:id/delete", asyncHandler(usersController.delete));

// Products CRUD
router.get("/products", asyncHandler(productsController.index));
router.get("/products/new", asyncHandler(productsController.newForm));
router.post("/products/new", asyncHandler(productsController.create));
router.get("/products/:id/edit", asyncHandler(productsController.editForm));
router.post("/products/:id/edit", asyncHandler(productsController.update));
router.post("/products/:id/delete", asyncHandler(productsController.delete));

// Event-type product sections (Webinars, Seminars, Classrooms) — list products, manage events per product
router.use("/webinars", webinarsRoutes);
router.use("/seminars", seminarsRoutes);
router.use("/classrooms", classroomsRoutes);

// Collections CRUD
router.get("/collections", asyncHandler(collectionsController.index));
router.get("/collections/new", asyncHandler(collectionsController.newForm));
router.post("/collections/new", asyncHandler(collectionsController.create));
router.get("/collections/:id/edit", asyncHandler(collectionsController.editForm));
router.post("/collections/:id/edit", asyncHandler(collectionsController.update));
router.post("/collections/:id/delete", asyncHandler(collectionsController.delete));

// Product Types CRUD
router.get("/product-types", asyncHandler(productTypesController.index));
router.get("/product-types/new", asyncHandler(productTypesController.newForm));
router.post("/product-types/new", asyncHandler(productTypesController.create));
router.get("/product-types/:id/edit", asyncHandler(productTypesController.editForm));
router.post("/product-types/:id/edit", asyncHandler(productTypesController.update));
router.post("/product-types/:id/delete", asyncHandler(productTypesController.delete));

// Product Categories CRUD
router.get("/product-categories", asyncHandler(productCategoriesController.index));
router.get("/product-categories/new", asyncHandler(productCategoriesController.newForm));
router.post("/product-categories/new", asyncHandler(productCategoriesController.create));
router.get("/product-categories/:id/edit", asyncHandler(productCategoriesController.editForm));
router.post("/product-categories/:id/edit", asyncHandler(productCategoriesController.update));
router.post("/product-categories/:id/delete", asyncHandler(productCategoriesController.delete));

// Tax Rates CRUD
router.get("/tax-rates", asyncHandler(taxRatesController.index));
router.get("/tax-rates/new", asyncHandler(taxRatesController.newForm));
router.post("/tax-rates/new", asyncHandler(taxRatesController.create));
router.get("/tax-rates/:id/edit", asyncHandler(taxRatesController.editForm));
router.post("/tax-rates/:id/edit", asyncHandler(taxRatesController.update));
router.post("/tax-rates/:id/delete", asyncHandler(taxRatesController.delete));

// Meta Objects CRUD
router.get("/api/meta-objects", asyncHandler(metaObjectsController.listApi));
router.get("/meta-objects", asyncHandler(metaObjectsController.index));
router.get("/meta-objects/new", asyncHandler(metaObjectsController.newForm));
router.post("/meta-objects/new", asyncHandler(metaObjectsController.create));
router.get("/meta-objects/:id/edit", asyncHandler(metaObjectsController.editForm));
router.post("/meta-objects/:id/edit", asyncHandler(metaObjectsController.update));
router.post("/meta-objects/:id/delete", asyncHandler(metaObjectsController.delete));

// Media (upload, list, delete)
router.get("/media", asyncHandler(mediaController.index));
router.get("/api/media", asyncHandler(mediaController.listApi));
router.post("/media/upload", (req, res, next) => {
  uploadMedia(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.setFlash("error", "File too large.");
        return res.redirect((req.adminPrefix || "") + "/media");
      }
      res.setFlash("error", err.message || "Upload failed.");
      return res.redirect((req.adminPrefix || "") + "/media");
    }
    next();
  });
}, asyncHandler(mediaController.upload));
router.post("/media/:id/delete", asyncHandler(mediaController.delete));

// Blog (posts) CRUD
router.get("/blog", asyncHandler(postsController.index));
router.get("/blog/new", asyncHandler(postsController.newForm));
router.post("/blog/new", asyncHandler(postsController.create));
router.get("/blog/:id/edit", asyncHandler(postsController.editForm));
router.post("/blog/:id/edit", asyncHandler(postsController.update));
router.post("/blog/:id/delete", asyncHandler(postsController.delete));

// Menus CRUD
router.get("/menus", asyncHandler(menusController.index));
router.get("/menus/new", asyncHandler(menusController.newForm));
router.post("/menus/new", asyncHandler(menusController.create));
router.get("/menus/:id/edit", asyncHandler(menusController.editForm));
router.post("/menus/:id/edit", asyncHandler(menusController.update));
router.post("/menus/:id/delete", asyncHandler(menusController.delete));

// Menu Items CRUD
router.get("/menu-items", asyncHandler(menuItemsController.index));
router.get("/menu-items/new", asyncHandler(menuItemsController.newForm));
router.post("/menu-items/new", asyncHandler(menuItemsController.create));
router.get("/menu-items/:id/edit", asyncHandler(menuItemsController.editForm));
router.post("/menu-items/:id/edit", asyncHandler(menuItemsController.update));
router.post("/menu-items/:id/delete", asyncHandler(menuItemsController.delete));

module.exports = router;
