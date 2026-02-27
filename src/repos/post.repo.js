const { Post } = require("../models");
const { Op } = require("sequelize");

module.exports = {
  async findAll(options = {}) {
    return await Post.findAll({
      order: [["createdAt", "DESC"]],
      ...options,
    });
  },

  async findPublished(options = {}) {
    return await Post.findAll({
      where: { published: true },
      order: [["publishedAt", "DESC"]],
      ...options,
    });
  },

  async findById(id, options = {}) {
    if (!id) return null;
    return await Post.findByPk(id, options);
  },

  async findBySlug(slug, options = {}) {
    if (!slug) return null;
    return await Post.findOne({
      where: { slug: String(slug).trim(), published: true },
      ...options,
    });
  },

  async create(data, options = {}) {
    return await Post.create(data, options);
  },

  async update(id, data, options = {}) {
    const post = await Post.findByPk(id, options);
    if (!post) return null;
    return await post.update(data, options);
  },

  async delete(id, options = {}) {
    const post = await Post.findByPk(id, options);
    if (!post) return false;
    await post.destroy(options);
    return true;
  },

  async count(options = {}) {
    return await Post.count(options);
  },
};
