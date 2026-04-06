/**
 * Admin sidebar: accordion groups + expand section containing the current route.
 *
 * Animation model:
 *   Restored from sessionStorage → openInstant (silent, no animation)
 *   Active route group not previously open → openAnimated (user just navigated here)
 *   User toggle → openAnimated / closeAnimated
 *
 * Open group state is persisted in sessionStorage so manually opened groups
 * survive page navigations and sublink clicks don't re-animate already-open groups.
 */
(function () {
  var root = document.querySelector("[data-admin-sidebar-nav]");
  if (!root) return;

  var STORAGE_KEY = "admin-nav-open";

  // Must match the longest transition duration in admin-sidebar-nav.css (max-height: 0.4s).
  var ANIM_DURATION_MS = 420;

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

  // ── sessionStorage helpers ──────────────────────────────────────────────────

  function getSavedGroups() {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]");
    } catch (_) {
      return [];
    }
  }

  function saveOpenGroups() {
    var open = [];
    root.querySelectorAll("[data-nav-group].is-open").forEach(function (group) {
      var link = group.querySelector(":scope > .admin-nav-row .admin-nav-link--parent");
      if (!link) return;
      try {
        var u = new URL(link.href, window.location.origin);
        open.push(normalizePath(u.pathname));
      } catch (_) {}
    });
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(open));
    } catch (_) {}
  }

  function getGroupPath(group) {
    var link = group.querySelector(":scope > .admin-nav-row .admin-nav-link--parent");
    if (!link) return null;
    try {
      return normalizePath(new URL(link.href, window.location.origin).pathname);
    } catch (_) {
      return null;
    }
  }

  // ── Open / close ────────────────────────────────────────────────────────────

  function openInstant(group, toggle) {
    group.classList.add("is-open");
    if (toggle) toggle.setAttribute("aria-expanded", "true");
  }

  function openAnimated(group, toggle) {
    clearGroupTimer(group);
    group.classList.add("is-animating");
    group.getBoundingClientRect(); // force reflow — locks in closed values as "before"
    group.classList.add("is-open");
    if (toggle) toggle.setAttribute("aria-expanded", "true");
    group._navTimer = setTimeout(function () {
      group.classList.remove("is-animating");
      group._navTimer = null;
    }, ANIM_DURATION_MS);
    saveOpenGroups();
  }

  function closeAnimated(group, toggle) {
    clearGroupTimer(group);
    group.classList.add("is-animating");
    group.getBoundingClientRect(); // force reflow — locks in open values as "before"
    group.classList.remove("is-open");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
    group._navTimer = setTimeout(function () {
      group.classList.remove("is-animating");
      group._navTimer = null;
    }, ANIM_DURATION_MS);
    saveOpenGroups();
  }

  function clearGroupTimer(group) {
    if (group._navTimer) {
      clearTimeout(group._navTimer);
      group._navTimer = null;
    }
  }

  // ── Init ────────────────────────────────────────────────────────────────────

  function init() {
    var savedPaths = getSavedGroups();

    // Phase 1: restore all previously open groups instantly (no animation).
    root.querySelectorAll("[data-nav-group]").forEach(function (group) {
      var toggle = group.querySelector(":scope > .admin-nav-row .admin-nav-toggle");
      var gp = getGroupPath(group);
      if (gp && savedPaths.indexOf(gp) !== -1) {
        openInstant(group, toggle);
      }
    });

    // Phase 2: find the active link for the current URL.
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

    if (best) {
      best.classList.add("is-active");

      // Walk up to find ancestor groups. If a group wasn't previously open
      // (not in savedPaths), animate it — user just navigated into this section.
      var el = best.parentElement;
      while (el && el !== root) {
        if (el.hasAttribute && el.hasAttribute("data-nav-group")) {
          if (!el.classList.contains("is-open")) {
            var toggle = el.querySelector(":scope > .admin-nav-row .admin-nav-toggle");
            openAnimated(el, toggle);
          }
        }
        el = el.parentElement;
      }
    }

    // Phase 3: persist the current open state (restored + any newly opened group).
    saveOpenGroups();
  }

  // ── Toggle buttons ──────────────────────────────────────────────────────────

  root.querySelectorAll("[data-nav-group]").forEach(function (group) {
    var toggle = group.querySelector(":scope > .admin-nav-row .admin-nav-toggle");
    if (!toggle) return;
    toggle.addEventListener("click", function (e) {
      e.preventDefault();
      if (group.classList.contains("is-open")) {
        closeAnimated(group, toggle);
      } else {
        openAnimated(group, toggle);
      }
    });
  });

  init();
})();