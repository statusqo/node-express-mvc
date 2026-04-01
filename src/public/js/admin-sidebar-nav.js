/**
 * Admin sidebar: accordion groups + expand section containing the current route.
 */
(function () {
  var root = document.querySelector("[data-admin-sidebar-nav]");
  if (!root) return;

  function normalizePath(p) {
    if (!p) return "/";
    if (p.length > 1 && p.endsWith("/")) return p.slice(0, -1);
    return p;
  }

  var pathname = normalizePath(window.location.pathname);

  function pathMatches(linkPath) {
    var lp = normalizePath(linkPath);
    if (lp === pathname) return true;
    if (lp !== "/" && pathname.startsWith(lp + "/")) return true;
    return false;
  }

  /** Open all ancestor groups for active links */
  function expandForCurrentPath() {
    var links = root.querySelectorAll("a.admin-nav-link[href]");
    var best = null;
    var bestLen = -1;
    links.forEach(function (a) {
      try {
        var u = new URL(a.href, window.location.origin);
        var p = normalizePath(u.pathname);
        if (pathMatches(p) && p.length > bestLen) {
          bestLen = p.length;
          best = a;
        }
      } catch (_) {}
    });
    if (!best) return;

    best.classList.add("is-active");
    var el = best.parentElement;
    while (el && el !== root) {
      if (el.hasAttribute && el.hasAttribute("data-nav-group")) {
        el.classList.add("is-open");
        var toggle = el.querySelector(":scope > .admin-nav-row .admin-nav-toggle");
        if (toggle) toggle.setAttribute("aria-expanded", "true");
      }
      el = el.parentElement;
    }
  }

  root.querySelectorAll("[data-nav-group]").forEach(function (group) {
    var toggle = group.querySelector(":scope > .admin-nav-row .admin-nav-toggle");
    if (!toggle) return;
    toggle.addEventListener("click", function (e) {
      e.preventDefault();
      var open = group.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  });

  expandForCurrentPath();
})();
