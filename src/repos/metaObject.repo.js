const { MetaObject, Product } = require("../models");

module.exports = {
  async findAll(options = {}) {
    return await MetaObject.findAll({ where: { active: true }, ...options });
  },

  async findAllForAdmin(options = {}) {
    return await MetaObject.findAll({
      order: [["name", "ASC"]],
      ...options,
    });
  },

  async findById(id, options = {}) {
    return await MetaObject.findByPk(id, options);
  },

  async findBySlug(slug, options = {}) {
    return await MetaObject.findOne({ where: { slug }, ...options });
  },

  async create(data, options = {}) {
    const payload = { ...data };
    if (payload.definition != null && typeof payload.definition === "string") {
      try {
        payload.definition = JSON.parse(payload.definition || "[]");
      } catch {
        payload.definition = [];
      }
    }
    return await MetaObject.create(payload, options);
  },

  async update(id, data, options = {}) {
    const metaObject = await MetaObject.findByPk(id, options);
    if (!metaObject) return null;
    const payload = { ...data };
    if (payload.definition != null && typeof payload.definition === "string") {
      try {
        payload.definition = JSON.parse(payload.definition || "[]");
      } catch {
        payload.definition = [];
      }
    }
    return await metaObject.update(payload, options);
  },

  async delete(id, options = {}) {
    const metaObject = await MetaObject.findByPk(id, options);
    if (!metaObject) return { deleted: false, error: "Meta object not found." };
    try {
      await metaObject.destroy(options);
      return { deleted: true };
    } catch (err) {
      if (err.name === "SequelizeForeignKeyConstraintError") {
        return { deleted: false, error: "Cannot delete: this meta object is assigned to one or more products." };
      }
      throw err;
    }
  },

  async count(options = {}) {
    return await MetaObject.count(options);
  },
};
