function notFound(req, res) {
  res.status(404).render("web/errors/error", {
    title: "Not Found",
    status: 404,
    message: "Page not found."
  });
}
module.exports = { notFound };
