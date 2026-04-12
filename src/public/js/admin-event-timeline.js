/**
 * Admin Events timeline — scroll to today's section (upcoming view).
 */
(function () {
  var btn = document.querySelector("[data-admin-events-scroll-today]");
  if (!btn) return;

  btn.addEventListener("click", function () {
    var el = document.querySelector(".da-events-day--today");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
})();
