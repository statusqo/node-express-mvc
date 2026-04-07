/* ═══════════════════════════════════════════════════════════════════
   ADMIN DASHBOARD — Micro-interactions, animations, revenue chart
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    /* ── KPI counter animation ──────────────────────────────────────── */

    function animateCounter(el) {
        var raw    = el.getAttribute('data-counter');
        var target = parseInt(raw, 10);
        if (isNaN(target) || target <= 0) {
            el.textContent = raw || '0';
            return;
        }

        var duration  = 900;
        var startTime = null;

        function easeOutExpo(t) {
            return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
        }

        function tick(timestamp) {
            if (!startTime) startTime = timestamp;
            var elapsed  = timestamp - startTime;
            var progress = Math.min(elapsed / duration, 1);
            el.textContent = Math.round(easeOutExpo(progress) * target).toLocaleString();
            if (progress < 1) {
                requestAnimationFrame(tick);
            } else {
                el.textContent = target.toLocaleString();
            }
        }

        el.textContent = '0';
        requestAnimationFrame(tick);
    }

    function initCounters() {
        var counters = document.querySelectorAll('[data-counter]');
        if (!counters.length) return;

        if ('IntersectionObserver' in window) {
            var observer = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        animateCounter(entry.target);
                        observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.15 });
            counters.forEach(function (el) { observer.observe(el); });
        } else {
            counters.forEach(animateCounter);
        }
    }

    /* ── Progress bar animation (pipeline fills, event fills, top-products) */

    function initBars() {
        var bars = document.querySelectorAll('[data-bar-width]');
        if (!bars.length) return;

        if ('IntersectionObserver' in window) {
            var observer = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        var w = entry.target.getAttribute('data-bar-width');
                        entry.target.style.width = (w || 0) + '%';
                        observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.1 });
            bars.forEach(function (el) {
                el.style.width = '0%';
                observer.observe(el);
            });
        } else {
            bars.forEach(function (el) {
                el.style.width = el.getAttribute('data-bar-width') + '%';
            });
        }
    }

    /* ── Search keyboard shortcut ───────────────────────────────────── */

    function initSearchShortcut() {
        var input = document.getElementById('dash-search-input');
        if (!input) return;

        document.addEventListener('keydown', function (e) {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                input.focus();
                input.select();
            }
            if (e.key === 'Escape' && document.activeElement === input) {
                input.blur();
            }
        });
    }

    /* ── Init ───────────────────────────────────────────────────────── */

    function init() {
        initCounters();
        initBars();
        initSearchShortcut();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
