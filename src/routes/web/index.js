const express = require("express");

const homeRoutes = require("./home.routes");
const accountRoutes = require("./account.routes");
const cartRoutes = require("./cart.routes");
const checkoutRoutes = require("./checkout.routes");
const ordersRoutes = require("./orders.routes");
const productsRoutes = require("./products.routes");
const eventsRoutes = require("./events.routes");
const collectionsRoutes = require("./collections.routes");
const blogRoutes = require("./blog.routes");
const contactRoutes = require("./contact.routes");

const router = express.Router();

router.use("/", homeRoutes);
router.use("/account", accountRoutes);
router.use("/cart", cartRoutes);
router.use("/checkout", checkoutRoutes);
router.use("/orders", ordersRoutes);
router.use("/products", productsRoutes);
router.use("/events", eventsRoutes);
router.use("/collections", collectionsRoutes);
// Redirect legacy /services to /products
router.get("/services", (req, res) => res.redirect("/products"));
router.get("/services/:slug", (req, res) => res.redirect("/products/" + req.params.slug));
router.use("/blog", blogRoutes);
router.use("/contact", contactRoutes);

module.exports = router;
