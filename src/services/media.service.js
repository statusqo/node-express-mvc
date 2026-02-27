const path = require("path");
const fs = require("fs").promises;
const mediaRepo = require("../repos/media.repo");
const config = require("../config");

module.exports = {
  async findAllForAdmin(options = {}) {
    return await mediaRepo.findAllForAdmin(options);
  },

  async findById(id, options = {}) {
    return await mediaRepo.findById(id, options);
  },

  async create(data, options = {}) {
    return await mediaRepo.create(data, options);
  },

  /**
   * Delete media by id. Removes the file from disk (if it exists) then deletes the DB row.
   * Join rows (product_media, collection_media) are removed by FK CASCADE.
   */
  async delete(id, options = {}) {
    const media = await mediaRepo.findById(id, options);
    if (!media) return false;
    const uploadsDir = config.uploads.dir;
    const filePath = path.join(uploadsDir, media.path);
    try {
      await fs.access(filePath);
      await fs.unlink(filePath);
    } catch (err) {
      if (err.code !== "ENOENT") {
        throw err;
      }
      // File already missing; continue to delete DB row
    }
    return await mediaRepo.destroy(id, options);
  },
};
