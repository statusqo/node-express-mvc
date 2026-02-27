const collectionService = require("../../services/collection.service");
const config = require("../../config");

const uploadsBaseUrl = config.uploads?.urlPath || "/uploads";

function mediaWithUrls(mediaArray, sortKey = "CollectionMedia") {
  if (!mediaArray || !Array.isArray(mediaArray)) return [];
  return mediaArray
    .sort((a, b) => ((a[sortKey] && a[sortKey].sortOrder) ?? 0) - ((b[sortKey] && b[sortKey].sortOrder) ?? 0))
    .map((m) => {
      const p = m && typeof m.get === "function" ? m.get({ plain: true }) : m;
      if (!p) return null;
      const path = (p.path || "").replace(/\\/g, "/");
      return {
        id: p.id,
        path,
        filename: p.filename,
        mimeType: p.mimeType,
        alt: p.alt,
        url: uploadsBaseUrl + (path ? "/" + path : ""),
      };
    })
    .filter(Boolean);
}

module.exports = {
  async index(req, res) {
    const collections = await collectionService.findAll({ order: [["title", "ASC"]] });
    res.render("web/collections/index", {
      title: "Collections",
      collections: collections || [],
      uploadsBaseUrl,
    });
  },

  async show(req, res) {
    const collection = await collectionService.findActiveBySlugWithMedia(req.params.slug);
    if (!collection) {
      res.setFlash("error", "Collection not found.");
      return res.redirect("/collections");
    }
    const plain = collection.get ? collection.get({ plain: true }) : collection;
    const media = mediaWithUrls(plain.media);
    const products = await collectionService.getProducts(collection.id);
    const productsPlain = (products || []).map((p) => {
      const prod = p.get ? p.get({ plain: true }) : p;
      const prodMedia = mediaWithUrls(prod.media, "ProductMedia");
      return { ...prod, media: prodMedia };
    });
    res.render("web/collections/show", {
      title: collection.title,
      collection: { ...plain, media },
      products: productsPlain,
      uploadsBaseUrl,
    });
  },
};
