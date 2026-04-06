/* ═══════════════════════════════════════════════════════════════════
   ADMIN DASHBOARD — Micro-interactions & Animations
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    /* ── KPI counter animation ──────────────────────────────────────── */

    /**
     * Animate a numeric counter from 0 to its target value.
     * Reads target from [data-counter] attribute.
     * @param {HTMLElement} el
     */
    function animateCounter(el) {
        var raw = el.getAttribute('data-counter');
        var target = parseInt(raw, 10);
        if (isNaN(target) || target <= 0) {
            el.textContent = raw || '0';
            return;
        }

        var duration = 900; // ms
        var startTime = null;

        function easeOutExpo(t) {
            return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
        }

        function tick(timestamp) {
            if (!startTime) startTime = timestamp;
            var elapsed = timestamp - startTime;
            var progress = Math.min(elapsed / duration, 1);
            var eased = easeOutExpo(progress);
            el.textContent = Math.round(eased * target).toLocaleString();
            if (progress < 1) {
                requestAnimationFrame(tick);
            } else {
                el.textContent = target.toLocaleString();
            }
        }

        el.textContent = '0';
        requestAnimationFrame(tick);
    }

    /**
     * Observe KPI stat elements and trigger animation when they enter the viewport.
     */
    function initCounters() {
        var counters = document.querySelectorAll('[data-counter]');
        if (!counters.length) return;

        if ('IntersectionObserver' in window) {
            var observer = new IntersectionObserver(
                function (entries) {
                    entries.forEach(function (entry) {
                        if (entry.isIntersecting) {
                            animateCounter(entry.target);
                            observer.unobserve(entry.target);
                        }
                    });
                },
                { threshold: 0.15 }
            );
            counters.forEach(function (el) { observer.observe(el); });
        } else {
            // Fallback: animate immediately
            counters.forEach(animateCounter);
        }
    }

    /* ── Inventory bar animation ────────────────────────────────────── */

    /**
     * Animate inventory bar fills from 0 to their target width.
     * Reads width from [data-bar-width] attribute (percentage 0-100).
     */
    function initInventoryBars() {
        var bars = document.querySelectorAll('[data-bar-width]');
        if (!bars.length) return;

        if ('IntersectionObserver' in window) {
            var observer = new IntersectionObserver(
                function (entries) {
                    entries.forEach(function (entry) {
                        if (entry.isIntersecting) {
                            var target = entry.target.getAttribute('data-bar-width');
                            entry.target.style.width = target + '%';
                            observer.unobserve(entry.target);
                        }
                    });
                },
                { threshold: 0.1 }
            );
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
            // ⌘K (Mac) or Ctrl+K (Win/Linux) — focus search
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                input.focus();
                input.select();
            }
            // Escape — blur search
            if (e.key === 'Escape' && document.activeElement === input) {
                input.blur();
            }
        });
    }

    /* ── Alert pulse animation ──────────────────────────────────────── */

    /**
     * Add a subtle pulse to glowing alert dots when the page loads.
     */
    function initAlertDots() {
        var style = document.createElement('style');
        style.textContent = [
            '@keyframes dot-pulse {',
            '  0%, 100% { opacity: 1; transform: scale(1); }',
            '  50%       { opacity: 0.6; transform: scale(1.35); }',
            '}',
            '.dash-alert-dot--refund,',
            '.dash-alert-dot--order {',
            '  animation: dot-pulse 2.4s ease-in-out infinite;',
            '}'
        ].join('\n');
        document.head.appendChild(style);
    }

    /* ── Init ───────────────────────────────────────────────────────── */

    function init() {
        initCounters();
        initInventoryBars();
        initSearchShortcut();
        // Defer style injection until after sidebar open animation completes (420ms).
        setTimeout(initAlertDots, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
