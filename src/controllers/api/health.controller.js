// src/controllers/api/health.controller.js
module.exports = {
  async publicHealth(req, res) {
    res.json({ ok: true, scope: "public" });
  },

  async privateHealth(req, res) {
    res.json({ ok: true, scope: "private", user: req.user });
  },
};