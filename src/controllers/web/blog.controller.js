const postService = require("../../services/post.service");

module.exports = {
  async index(req, res) {
    const posts = await postService.findPublished();
    res.render("web/blog/index", {
      title: "Blog",
      posts: posts || [],
    });
  },

  async show(req, res) {
    const post = await postService.findBySlug(req.params.slug);
    if (!post) {
      return res.status(404).render("web/errors/error", {
        title: "Not Found",
        message: "Post not found",
        status: 404,
      });
    }
    if (post.bodyIsHtml) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(post.body);
    }
    res.render("web/blog/show", {
      title: post.title,
      post: post.get ? post.get({ plain: true }) : post,
    });
  },
};
