const { Media } = require("../models");

module.exports = {
  async findAll(options = {}) {
    return await Media.findAll({ order: [["createdAt", "DESC"]], ...options });
  },

  async findAllForAdmin(options = {}) {
    return await Media.findAll({ order: [["createdAt", "DESC"]], ...options });
  },

  async findById(id, options = {}) {
    return await Media.findByPk(id, options);
  },

  async create(data, options = {}) {
    return await Media.create(
      {
        path: data.path,
        filename: data.filename ?? null,
        mimeType: data.mimeType ?? null,
        size: data.size ?? null,
        alt: data.alt ? String(data.alt).trim() : null,
      },
      options
    );
  },

  async destroy(id, options = {}) {
    const row = await Media.findByPk(id, options);
    if (!row) return { deleted: false, error: "Media not found." };
    try {
      await row.destroy(options);
      return { deleted: true };
    } catch (err) {
      if (err.name === "SequelizeForeignKeyConstraintError") {
        return { deleted: false, error: "Cannot delete: this media file is in use by one or more records." };
      }
      throw err;
    }
  },
};
