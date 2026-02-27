// src/controllers/home.controller.js
module.exports = {
  async index(req, res) {
    res.render("web/home", {
      title: "Home",
      user: req.user || null,
    });
  },
};