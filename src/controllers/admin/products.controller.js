const productService = require("../../services/product.service");
const { validateProduct } = require("../../validators/product.schema");
const { parseDefinitionPairs, validateMetaObjectValues } = require("../../validators/metaObject.schema");
const config = require("../../config");

function slugify(s) {
  if (!s || typeof s !== "string") return "";
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function normalizeMetaObjectIds(metaObjectIds) {
  if (metaObjectIds == null) return [];
  const arr = Array.isArray(metaObjectIds) ? metaObjectIds : [metaObjectIds];
  return arr.filter((id) => id && String(id).trim());
}

function normalizeMediaIds(mediaIds) {
  if (mediaIds == null) return [];
  const arr = Array.isArray(mediaIds) ? mediaIds : [mediaIds];
  return arr.filter((id) => id && String(id).trim());
}

function toPlain(obj) {
  return obj && typeof obj.get === "function" ? obj.get({ plain: true }) : obj;
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

function withDefinitionPairs(metaObjects) {
  return (metaObjects || []).map((mo) => ({
    ...toPlain(mo),
    definitionPairs: parseDefinitionPairs(mo.definition),
  }));
}

/** Build attached meta objects for the picker: id, name, type, definitionPairs, values (in metaObjectIds order). */
function buildAttachedMetaObjects(metaObjectIds, metaObjectsWithPairs, metaObjectValues) {
  const ids = Array.isArray(metaObjectIds) ? metaObjectIds : [];
  const list = metaObjectsWithPairs || [];
  const byId = new Map(list.map((mo) => [String(mo.id), mo]));
  const values = metaObjectValues && typeof metaObjectValues === "object" ? metaObjectValues : {};
  return ids
    .map((id) => {
      const mo = byId.get(String(id));
      if (!mo) return null;
      return {
        id: mo.id,
        name: mo.name || "",
        type: mo.type || "",
        definitionPairs: mo.definitionPairs || [],
        values: values[mo.id] && typeof values[mo.id] === "object" ? values[mo.id] : {},
      };
    })
    .filter(Boolean);
}

module.exports = {
  async index(req, res) {
    const products = await productService.findAll({});
    const list = (products || []).map((p) => {
      const plain = p.get ? p.get({ plain: true }) : p;
      const variant = plain.ProductVariants && plain.ProductVariants[0];
      const priceRow = variant?.ProductPrices?.[0];
      return {
        ...plain,
        price: priceRow ? Number(priceRow.amount) : null,
        currency: priceRow?.currency || "USD",
      };
    });
    res.render("admin/products/index", { title: "Products", products: list });
  },

  async newForm(req, res) {
    const { types, categories } = await productService.getFormData();
    res.render("admin/products/form", {
      title: "New Product",
      uploadsBaseUrl: getUploadsBaseUrl(),
      product: null,
      productTypes: (types || []).map(toPlain),
      productCategories: (categories || []).map(toPlain),
      attachedMetaObjects: [],
      attachedMedia: [],
      isEdit: false,
    });
  },

  async create(req, res) {
    const slugVal = req.body.slug ? String(req.body.slug).trim() : slugify(req.body.title);
    const result = validateProduct(req.body, slugVal);
    if (!result.ok) {
      const { types, categories, metaObjects } = await productService.getFormData();
      const metaObjectsWithPairs = withDefinitionPairs(metaObjects);
      const attachedMetaObjects = buildAttachedMetaObjects(normalizeMetaObjectIds(req.body.metaObjectIds), metaObjectsWithPairs, req.body.metaObjectValues || {});
      return res.status(400).render("admin/products/form", {
        title: "New Product",
        product: { ...req.body, slug: slugVal, active: req.body.active === "on", isPhysical: req.body.isPhysical === "on", metaObjectValues: req.body.metaObjectValues || {}, mediaIds: normalizeMediaIds(req.body.mediaIds) },
        productTypes: (types || []).map(toPlain),
        productCategories: (categories || []).map(toPlain),
        attachedMetaObjects,
        attachedMedia: [],
        uploadsBaseUrl: getUploadsBaseUrl(),
        isEdit: false,
        error: result.errors[0].message,
      });
    }
    const { types, categories, metaObjects } = await productService.getFormData();
    const ids = normalizeMetaObjectIds(req.body.metaObjectIds);
    const allowedAttributesByMetaObjectId = {};
    (metaObjects || []).forEach((mo) => {
      const pairs = parseDefinitionPairs(mo.definition);
      allowedAttributesByMetaObjectId[mo.id] = Object.fromEntries(pairs.map((p) => [p.key, p.type || "string"]));
    });
    const metaObjectValuesCreate = req.body.metaObjectValues;
    const filteredMetaObjectValues = {};
    if (metaObjectValuesCreate && typeof metaObjectValuesCreate === "object" && !Array.isArray(metaObjectValuesCreate)) {
      ids.forEach((mid) => {
        if (metaObjectValuesCreate[mid] && typeof metaObjectValuesCreate[mid] === "object") {
          const raw = metaObjectValuesCreate[mid];
          const normalized = {};
          for (const [key, val] of Object.entries(raw)) {
            normalized[key] = Array.isArray(val) ? val[val.length - 1] : val;
          }
          filteredMetaObjectValues[mid] = normalized;
        }
      });
    }
    const metaValidation = validateMetaObjectValues(filteredMetaObjectValues, allowedAttributesByMetaObjectId);
    if (!metaValidation.ok) {
      const metaObjectsWithPairs = withDefinitionPairs(metaObjects);
      const attachedMetaObjects = buildAttachedMetaObjects(ids, metaObjectsWithPairs, req.body.metaObjectValues || {});
      return res.status(400).render("admin/products/form", {
        title: "New Product",
        product: { ...req.body, slug: slugVal, active: req.body.active === "on", metaObjectIds: ids, metaObjectValues: req.body.metaObjectValues || {}, mediaIds: normalizeMediaIds(req.body.mediaIds) },
        productTypes: (types || []).map(toPlain),
        productCategories: (categories || []).map(toPlain),
        attachedMetaObjects,
        attachedMedia: [],
        uploadsBaseUrl: getUploadsBaseUrl(),
        isEdit: false,
        error: metaValidation.errors?.join(" ") || "Invalid meta object values.",
      });
    }
    const validMetaIds = new Set((metaObjects || []).map((m) => String(m.id)));
    const invalidIds = ids.filter((mid) => !validMetaIds.has(String(mid)));
    if (invalidIds.length > 0) {
      const metaObjectsWithPairs = withDefinitionPairs(metaObjects);
      const attachedMetaObjects = buildAttachedMetaObjects(ids, metaObjectsWithPairs, req.body.metaObjectValues || {});
      return res.status(400).render("admin/products/form", {
        title: "New Product",
        product: { ...req.body, slug: slugVal, active: req.body.active === "on", metaObjectIds: ids, metaObjectValues: req.body.metaObjectValues || {}, mediaIds: normalizeMediaIds(req.body.mediaIds) },
        productTypes: (types || []).map(toPlain),
        productCategories: (categories || []).map(toPlain),
        attachedMetaObjects,
        attachedMedia: [],
        uploadsBaseUrl: getUploadsBaseUrl(),
        isEdit: false,
        error: "One or more selected meta objects are invalid.",
      });
    }
    await productService.create({
      ...result.data,
      quantity: result.data.quantity,
      metaObjectIds: ids,
      metaObjectValues: metaValidation.data,
      mediaIds: normalizeMediaIds(req.body.mediaIds),
    });
    res.setFlash("success", "Product created.");
    res.redirect((req.adminPrefix || "") + "/products");
  },

  async editForm(req, res) {
    const product = await productService.findByIdWithFormData(req.params.id);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/products");
    }
    const plain = product.get ? product.get({ plain: true }) : product;
    const variant = plain.ProductVariants && plain.ProductVariants[0];
    const priceRow = variant?.ProductPrices?.[0];
    const metaObjectIds = (plain.metaObjects || []).map((mo) => mo.id);
    const metaObjectValues = {};
    (plain.metaObjects || []).forEach((mo) => {
      const vals = mo.ProductMetaObject?.values;
      metaObjectValues[mo.id] = vals && typeof vals === "object" ? vals : {};
    });
    const mediaList = plain.media || [];
    const sortedMedia = [...mediaList].sort((a, b) => (a.ProductMedia?.sortOrder ?? 0) - (b.ProductMedia?.sortOrder ?? 0));
    const mediaIds = sortedMedia.map((m) => m.id);
    const attachedMedia = sortedMedia.map(toAttachedMediaItem);
    const { types, categories, metaObjects } = await productService.getFormData();
    const metaObjectsWithPairs = withDefinitionPairs(metaObjects);
    const attachedMetaObjects = buildAttachedMetaObjects(metaObjectIds, metaObjectsWithPairs, metaObjectValues);
    res.render("admin/products/form", {
      title: "Edit Product",
      uploadsBaseUrl: getUploadsBaseUrl(),
      product: {
        ...plain,
        priceAmount: priceRow ? Number(priceRow.amount) : "",
        currency: priceRow?.currency || "USD",
        quantity: variant && variant.quantity != null ? variant.quantity : 0,
        metaObjectIds,
        metaObjectValues,
        mediaIds,
      },
      productTypes: (types || []).map(toPlain),
      productCategories: (categories || []).map(toPlain),
      attachedMetaObjects,
      attachedMedia,
      isEdit: true,
    });
  },

  async update(req, res) {
    const { id } = req.params;
    const product = await productService.findByIdWithMetaObjects(id);
    if (!product) {
      res.setFlash("error", "Product not found.");
      return res.redirect((req.adminPrefix || "") + "/products");
    }
    const plain = product.get ? product.get({ plain: true }) : product;
    const existingMetaObjectIds = (plain.metaObjects || []).map((mo) => mo.id);
    const existingMetaObjectValues = {};
    (plain.metaObjects || []).forEach((mo) => {
      const vals = mo.ProductMetaObject?.values;
      existingMetaObjectValues[mo.id] = vals && typeof vals === "object" ? vals : {};
    });
    const slugVal = req.body.slug ? String(req.body.slug).trim() : slugify(req.body.title);
    const result = validateProduct(req.body, slugVal);
    if (!result.ok) {
      const { types, categories, metaObjects, media } = await productService.getFormData();
      const metaObjectsWithPairs = withDefinitionPairs(metaObjects);
      const attachedMetaObjects = buildAttachedMetaObjects(existingMetaObjectIds, metaObjectsWithPairs, req.body.metaObjectValues || existingMetaObjectValues);
      const mediaIdsOrder = normalizeMediaIds(req.body.mediaIds);
      const mediaById = new Map((media || []).map((m) => [String(m.id), toPlain(m)]));
      const attachedMedia = mediaIdsOrder.map((id) => mediaById.get(String(id))).filter(Boolean).map(toAttachedMediaItem);
      return res.status(400).render("admin/products/form", {
        title: "Edit Product",
        product: { id, ...req.body, slug: slugVal, active: req.body.active === "on", metaObjectIds: existingMetaObjectIds, metaObjectValues: req.body.metaObjectValues || existingMetaObjectValues, mediaIds: mediaIdsOrder },
        productTypes: (types || []).map(toPlain),
        productCategories: (categories || []).map(toPlain),
        attachedMetaObjects,
        attachedMedia,
        uploadsBaseUrl: getUploadsBaseUrl(),
        isEdit: true,
        error: result.errors[0].message,
      });
    }
    const { types, categories, metaObjects, media } = await productService.getFormData();
    const ids = normalizeMetaObjectIds(req.body.metaObjectIds);
    const validMetaIds = new Set((metaObjects || []).map((m) => String(m.id)));
    const validIds = ids.filter((mid) => validMetaIds.has(String(mid)));
    const allowedAttributesByMetaObjectId = {};
    (metaObjects || []).forEach((mo) => {
      const pairs = parseDefinitionPairs(mo.definition);
      allowedAttributesByMetaObjectId[mo.id] = Object.fromEntries(pairs.map((p) => [p.key, p.type || "string"]));
    });
    const filteredMetaObjectValues = { ...existingMetaObjectValues };
    const metaObjectValues = req.body.metaObjectValues;
    if (metaObjectValues && typeof metaObjectValues === "object" && !Array.isArray(metaObjectValues)) {
      validIds.forEach((mid) => {
        if (metaObjectValues[mid] && typeof metaObjectValues[mid] === "object") {
          const raw = metaObjectValues[mid];
          const normalized = {};
          for (const [key, val] of Object.entries(raw)) {
            normalized[key] = Array.isArray(val) ? val[val.length - 1] : val;
          }
          filteredMetaObjectValues[mid] = normalized;
        }
      });
    }
    const metaValidation = validateMetaObjectValues(filteredMetaObjectValues, allowedAttributesByMetaObjectId);
    if (!metaValidation.ok) {
      const metaObjectsWithPairs = withDefinitionPairs(metaObjects);
      const attachedMetaObjects = buildAttachedMetaObjects(ids, metaObjectsWithPairs, req.body.metaObjectValues || filteredMetaObjectValues);
      const mediaIdsOrder = normalizeMediaIds(req.body.mediaIds);
      const mediaById = new Map((media || []).map((m) => [String(m.id), toPlain(m)]));
      const attachedMedia = mediaIdsOrder.map((mid) => mediaById.get(String(mid))).filter(Boolean).map(toAttachedMediaItem);
      return res.status(400).render("admin/products/form", {
        title: "Edit Product",
        product: { id, ...req.body, slug: slugVal, active: req.body.active === "on", metaObjectIds: ids, metaObjectValues: req.body.metaObjectValues || filteredMetaObjectValues, mediaIds: mediaIdsOrder },
        productTypes: (types || []).map(toPlain),
        productCategories: (categories || []).map(toPlain),
        attachedMetaObjects,
        attachedMedia,
        uploadsBaseUrl: getUploadsBaseUrl(),
        isEdit: true,
        error: metaValidation.errors?.join(" ") || "Invalid meta object values.",
      });
    }
    await productService.update(id, {
      ...result.data,
      quantity: result.data.quantity,
      metaObjectIds: validIds,
      metaObjectValues: metaValidation.data,
      mediaIds: normalizeMediaIds(req.body.mediaIds),
    });
    res.setFlash("success", "Product updated.");
    res.redirect((req.adminPrefix || "") + "/products");
  },

  async delete(req, res) {
    const result = await productService.delete(req.params.id);
    if (result.deleted) res.setFlash("success", "Product deleted.");
    else res.setFlash("error", result.error || "Product not found.");
    res.redirect((req.adminPrefix || "") + "/products");
  },
};
