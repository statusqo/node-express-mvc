module.exports = {
    async contact(req, res) {
        // Optional: show success/error after redirect
        const ok = req.query.ok === "1";
        const fail = req.query.fail === "1";

        res.render("web/contact", {
            title: "Contact",
            ok,
            fail
        });
    }
}