const collectionService = require("../../services/collection.service");
const { validateCollection } = require("../../validators/collection.schema");
const config = require("../../config");

function slugify(s) {
  if (!s || typeof s !== "string") return "";
  return s.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function getUploadsBaseUrl() {
  return config.uploads?.urlPath || "/uploads";
}

function toAttachedMediaItem(m) {
  const p = m && (typeof m.get === "function" ? m.get({ plain: true }) : m) || {};
  return {
    id: p.id,
    path: (p.path || "").replace(/\\/g, "/"),
    filename: p.filename || null,
    mimeType: p.mimeType || null,
    alt: p.alt || null,
  };
}

function normalizeMediaIds(mediaIds) {
  if (mediaIds == null) return [];
  const arr = Array.isArray(mediaIds) ? mediaIds : [mediaIds];
  return arr.filter((id) => id && String(id).trim());
}

function normalizeFeaturedMediaId(value) {
  if (!value || typeof value !== "string") return null;
  const id = value.trim();
  return id || null;
}

module.exports = {
  async index(req, res) {
    const collections = await collectionService.findAllForAdmin();
    res.render("admin/collections/index", { title: "Collections", collections: collections || [] });
  },

  async newForm(req, res) {
    res.render("admin/collections/form", {
      title: "New Collection",
      collection: null,
      attachedMedia: [],
      uploadsBaseUrl: getUploadsBaseUrl(),
      isEdit: false,
    });
  },

  async create(req, res) {
    const slugVal = req.body.slug ? String(req.body.slug).trim() : slugify(req.body.title);
    const result = validateCollection(req.body, slugVal);
    if (!result.ok) {
      return res.status(400).render("admin/collections/form", {
        title: "New Collection",
        collection: { ...req.body, slug: slugVal, active: req.body.active === "on", mediaIds: normalizeMediaIds(req.body.mediaIds) },
        attachedMedia: [],
        uploadsBaseUrl: getUploadsBaseUrl(),
        isEdit: false,
        error: result.errors[0].message,
      });
    }
    await collectionService.create({ ...result.data, mediaIds: req.body.mediaIds, featuredMediaId: normalizeFeaturedMediaId(req.body.featuredMediaId) });
    res.setFlash("success", "Collection created.");
    res.redirect((req.adminPrefix || "") + "/collections");
  },

  async editForm(req, res) {
    const collection = await collectionService.findByIdWithMedia(req.params.id);
    if (!collection) {
      res.setFlash("error", "Collection not found.");
      return res.redirect((req.adminPrefix || "") + "/collections");
    }
    const plain = collection.get ? collection.get({ plain: true }) : collection;
    const mediaList = plain.media || [];
    const sortedMedia = [...mediaList].sort((a, b) => (a.CollectionMedia?.sortOrder ?? 0) - (b.CollectionMedia?.sortOrder ?? 0));
    const mediaIds = sortedMedia.map((m) => m.id);
    const attachedMedia = sortedMedia.map(toAttachedMediaItem);
    res.render("admin/collections/form", {
      title: "Edit Collection",
      collection: { ...plain, mediaIds },
      attachedMedia,
      featuredMediaId: plain.featuredMediaId || null,
      uploadsBaseUrl: getUploadsBaseUrl(),
      isEdit: true,
    });
  },

  async update(req, res) {
    const { id } = req.params;
    const collection = await collectionService.findById(id);
    if (!collection) {
      res.setFlash("error", "Collection not found.");
      return res.redirect((req.adminPrefix || "") + "/collections");
    }
    const slugVal = req.body.slug ? String(req.body.slug).trim() : slugify(req.body.title);
    const result = validateCollection(req.body, slugVal);
    if (!result.ok) {
      const { media } = await collectionService.getFormData();
      const mediaIdsOrder = normalizeMediaIds(req.body.mediaIds);
      const mediaById = new Map((media || []).map((m) => [String(m.id), m.get ? m.get({ plain: true }) : m]));
      const attachedMedia = mediaIdsOrder.map((mid) => mediaById.get(String(mid))).filter(Boolean).map(toAttachedMediaItem);
      return res.status(400).render("admin/collections/form", {
        title: "Edit Collection",
        collection: { id, ...req.body, slug: slugVal, active: req.body.active === "on", mediaIds: mediaIdsOrder },
        attachedMedia,
        featuredMediaId: normalizeFeaturedMediaId(req.body.featuredMediaId),
        uploadsBaseUrl: getUploadsBaseUrl(),
        isEdit: true,
        error: result.errors[0].message,
      });
    }
    await collectionService.update(id, { ...result.data, mediaIds: req.body.mediaIds, featuredMediaId: normalizeFeaturedMediaId(req.body.featuredMediaId) });
    res.setFlash("success", "Collection updated.");
    res.redirect((req.adminPrefix || "") + "/collections");
  },

  async delete(req, res) {
    const result = await collectionService.delete(req.params.id);
    if (result.deleted) res.setFlash("success", "Collection deleted.");
    else res.setFlash("error", result.error || "Collection not found.");
    res.redirect((req.adminPrefix || "") + "/collections");
  },
};
