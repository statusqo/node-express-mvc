const postService = require("../../services/post.service");
const { validatePost } = require("../../validators/post.schema");

function slugify(s) {
  if (!s || typeof s !== "string") return "";
  return s.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

module.exports = {
  async index(req, res) {
    const posts = await postService.findAll();
    res.render("admin/posts/index", { title: "Blog Posts", posts });
  },

  async newForm(req, res) {
    res.render("admin/posts/form", { title: "New Post", post: null, isEdit: false });
  },

  async create(req, res) {
    const slugVal = req.body.slug ? String(req.body.slug).trim() : slugify(req.body.title);
    const result = validatePost(req.body, slugVal);
    if (!result.ok) {
      return res.status(400).render("admin/posts/form", {
        title: "New Post",
        post: { ...req.body, slug: slugVal, published: req.body.published === "on", bodyIsHtml: req.body.bodyIsHtml === "on" },
        isEdit: false,
        error: result.errors[0].message,
      });
    }
    const { published } = result.data;
    await postService.create({
      ...result.data,
      publishedAt: published ? new Date() : null,
    });
    res.setFlash("success", "Post created.");
    res.redirect((req.adminPrefix || "") + "/blog");
  },

  async editForm(req, res) {
    const post = await postService.findById(req.params.id);
    if (!post) {
      res.setFlash("error", "Post not found.");
      return res.redirect((req.adminPrefix || "") + "/blog");
    }
    res.render("admin/posts/form", {
      title: "Edit Post",
      post: post.get ? post.get({ plain: true }) : post,
      isEdit: true,
    });
  },

  async update(req, res) {
    const { id } = req.params;
    const post = await postService.findById(id);
    if (!post) {
      res.setFlash("error", "Post not found.");
      return res.redirect((req.adminPrefix || "") + "/blog");
    }
    const slugVal = req.body.slug ? String(req.body.slug).trim() : slugify(req.body.title);
    const result = validatePost(req.body, slugVal);
    if (!result.ok) {
      const p = post.get ? post.get({ plain: true }) : post;
      return res.status(400).render("admin/posts/form", {
        title: "Edit Post",
        post: { id, ...req.body, slug: slugVal, published: req.body.published === "on", bodyIsHtml: req.body.bodyIsHtml === "on" },
        isEdit: true,
        error: result.errors[0].message,
      });
    }
    const updateData = { ...result.data };
    if (result.data.published && !post.publishedAt) {
      updateData.publishedAt = new Date();
    } else if (!result.data.published) {
      updateData.publishedAt = null;
    }
    await postService.update(id, updateData);
    res.setFlash("success", "Post updated.");
    res.redirect((req.adminPrefix || "") + "/blog");
  },

  async delete(req, res) {
    const deleted = await postService.delete(req.params.id);
    if (deleted) res.setFlash("success", "Post deleted.");
    else res.setFlash("error", "Post not found.");
    res.redirect((req.adminPrefix || "") + "/blog");
  },
};
