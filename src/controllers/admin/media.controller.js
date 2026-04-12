const path = require("path");
const fs = require("fs").promises;
const mediaService = require("../../services/media.service");
const config = require("../../config");

module.exports = {
  /** GET /admin/api/media — JSON list for media picker (reusable across product, collection, etc.) */
  async listApi(req, res) {
    const media = await mediaService.findAllForAdmin();
    const list = (media || []).map((m) => {
      const plain = m.get ? m.get({ plain: true }) : m;
      return {
        id: plain.id,
        path: (plain.path || "").replace(/\\/g, "/"),
        filename: plain.filename || null,
        mimeType: plain.mimeType || null,
        size: plain.size ?? null,
        alt: plain.alt || null,
      };
    });
    const uploadsBaseUrl = config.uploads?.urlPath || "/uploads";
    res.json({ media: list, uploadsBaseUrl });
  },

  async index(req, res) {
    const media = await mediaService.findAllForAdmin();
    const uploadsBase = config.uploads?.urlPath || "/uploads";
    const list = (media || []).map((m) => {
      const plain = m.get ? m.get({ plain: true }) : m;
      const urlPath = uploadsBase + "/" + (plain.path || "").replace(/\\/g, "/");
      return { ...plain, urlPath };
    });
    res.render("admin/media/index", { title: "Media", media: list });
  },

  async upload(req, res, next) {
    if (!req.file) {
      res.setFlash("error", "No file selected or file type not allowed.");
      return res.redirect((req.adminPrefix || "") + "/media");
    }
    const uploadsDir = config.uploads.dir;
    const relativePath = path.relative(uploadsDir, req.file.path).replace(/\\/g, "/");
    const alt = req.body.alt && typeof req.body.alt === "string" ? req.body.alt.trim() : null;
    try {
      await mediaService.create({
        path: relativePath,
        filename: req.file.originalname || null,
        mimeType: req.file.mimetype || null,
        size: req.file.size ?? null,
        alt: alt || null,
      });
      res.setFlash("success", "File uploaded.");
    } catch (err) {
      // DB insert failed — remove the file multer already wrote so the admin
      // can retry without leaving orphaned files on disk.
      try { await fs.unlink(req.file.path); } catch (_) {}
      next(err);
      return;
    }
    res.redirect((req.adminPrefix || "") + "/media");
  },

  async delete(req, res, next) {
    try {
      const result = await mediaService.delete(req.params.id);
      if (result.deleted) res.setFlash("success", "Media deleted.");
      else res.setFlash("error", result.error || "Media not found.");
    } catch (err) {
      next(err);
      return;
    }
    res.redirect((req.adminPrefix || "") + "/media");
  },
};
