/**
 * Admin sidebar — accordion toggle interactions.
 *
 * Open/closed state is owned by the SERVER, not by this script.
 * On every page request the browser sends the `admin_nav_open` cookie, the
 * server parses it and renders `is-open` on the correct groups before the HTML
 * leaves the server — so the markup always arrives in the right state.
 *
 * This script has two responsibilities:
 *   1. After each page load, write the current server-rendered open state back
 *      into the cookie so groups opened by the active-route logic are persisted
 *      for subsequent navigations (e.g. visiting Events keeps it open on Dashboard).
 *   2. Animate user-triggered toggle clicks and update the cookie immediately so
 *      the next page navigation reflects the new state.
 *
 * Animation model (unchanged from before):
 *   Server-rendered is-open  →  no animation class, instant (already visible on paint)
 *   User toggle              →  is-animating gates the CSS transition / stagger
 */
(function () {
  'use strict';

  var root = document.querySelector('[data-admin-sidebar-nav]');
  if (!root) return;

  var COOKIE_NAME      = 'admin_nav_open';
  var ANIM_DURATION_MS = 420; // must match longest transition in admin-sidebar-nav.css

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function normalizePath(p) {
    if (!p) return '/';
    return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
  }

  function getGroupPath(group) {
    var link = group.querySelector(':scope > .admin-nav-row .admin-nav-link--parent');
    if (!link) return null;
    try {
      return normalizePath(new URL(link.href, window.location.origin).pathname);
    } catch (_) {
      return null;
    }
  }

  // ── Cookie ────────────────────────────────────────────────────────────────────

  /**
   * Write the paths of every currently-open group into the cookie.
   * Called once on init (to persist server-rendered state) and after every toggle.
   */
  function saveOpenGroups() {
    var open = [];
    root.querySelectorAll('[data-nav-group].is-open').forEach(function (group) {
      var gp = getGroupPath(group);
      if (gp) open.push(gp);
    });
    document.cookie =
      COOKIE_NAME + '=' + encodeURIComponent(JSON.stringify(open)) +
      '; Path=/admin; SameSite=Lax; Max-Age=604800'; // 7 days — scoped to admin only
  }

  // ── Open / close ──────────────────────────────────────────────────────────────

  function openAnimated(group, toggle) {
    clearGroupTimer(group);
    group.classList.add('is-animating');
    group.getBoundingClientRect(); // force reflow — locks in closed values as "before"
    group.classList.add('is-open');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
    group._navTimer = setTimeout(function () {
      group.classList.remove('is-animating');
      group._navTimer = null;
    }, ANIM_DURATION_MS);
    saveOpenGroups();
  }

  function closeAnimated(group, toggle) {
    clearGroupTimer(group);
    group.classList.add('is-animating');
    group.getBoundingClientRect(); // force reflow — locks in open values as "before"
    group.classList.remove('is-open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    group._navTimer = setTimeout(function () {
      group.classList.remove('is-animating');
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

  // ── Toggle buttons ────────────────────────────────────────────────────────────

  root.querySelectorAll('[data-nav-group]').forEach(function (group) {
    var toggle = group.querySelector(':scope > .admin-nav-row .admin-nav-toggle');
    if (!toggle) return;
    toggle.addEventListener('click', function (e) {
      e.preventDefault();
      if (group.classList.contains('is-open')) {
        closeAnimated(group, toggle);
      } else {
        openAnimated(group, toggle);
      }
    });
  });

  // ── Init ──────────────────────────────────────────────────────────────────────

  // Persist the server-rendered open state into the cookie.
  // This ensures groups opened via the active-route logic (navCurrentPath) are
  // remembered for the next navigation, matching the behaviour users expect.
  saveOpenGroups();

}());
