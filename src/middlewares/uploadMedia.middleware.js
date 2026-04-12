const crypto = require("crypto");
const fs = require("fs").promises;
const multer = require("multer");
const config = require("../config");

const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "pdf"]);
const EXT_TO_MIME = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

function getSafeExtension(originalname) {
  if (!originalname || typeof originalname !== "string") return "";
  const lower = originalname.toLowerCase().trim();
  const lastDot = lower.lastIndexOf(".");
  if (lastDot === -1) return "";
  const ext = lower.slice(lastDot + 1).replace(/[^a-z0-9]/g, "");
  return ALLOWED_EXTENSIONS.has(ext) ? ext : "";
}

const storage = multer.diskStorage({
  async destination(req, file, cb) {
    const uploadsDir = config.uploads.dir;
    try {
      await fs.mkdir(uploadsDir, { recursive: true });
      cb(null, uploadsDir);
    } catch (err) {
      cb(err);
    }
  },
  filename(req, file, cb) {
    const ext = getSafeExtension(file.originalname);
    const name = crypto.randomUUID() + (ext ? `.${ext}` : "");
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.uploads.maxFileSizeBytes },
  fileFilter(req, file, cb) {
    const ext = getSafeExtension(file.originalname);
    if (!ext) {
      return cb(new Error("File type not allowed. Use: jpg, png, gif, webp, svg, pdf."));
    }
    const mime = EXT_TO_MIME[ext];
    if (!mime || !config.uploads.allowedMimeTypes.includes(mime)) {
      return cb(new Error("File type not allowed."));
    }
    if (file.mimetype && file.mimetype !== mime && !config.uploads.allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error("File MIME type not allowed."));
    }
    cb(null, true);
  },
});

/** Single file field name: "file". Use upload.single("file") in route. */
module.exports = {
  uploadMedia: upload.single("file"),
};
