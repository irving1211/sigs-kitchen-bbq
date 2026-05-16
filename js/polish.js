// Sig's Kitchen polish layer — restrained motion only.
// Honors prefers-reduced-motion + degrades gracefully when JS is off.
(function () {
  'use strict';

  var html = document.documentElement;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Marker class — CSS hides .reveal only when this is present so a no-JS load
  // never leaves content invisible.
  html.classList.add('has-polish');

  // ----------------- Reveal-on-scroll -----------------
  // Auto-tag: every .ribbon, every h2 inside a section, every .proof-card,
  // .stat-card, .next-stop-card, .service-card, .schedule__item, .home-base,
  // .contact-card. Also any element with class="reveal" pre-set.
  var revealTargets = [];
  ['.ribbon', 'section h2', '.proof-card', '.stat-card', '.next-stop-card',
    '.service-card', '.schedule__item', '.home-base', '.contact-card',
    '.about-mini__copy', '.about-mini__art', '.trust-item',
    '.menu-meta-block', '.proof-stat-strip', '.btn-group',
    '.event-list__item', '.included-grid > div', '.catering-form-wrap'].forEach(function (sel) {
    Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) {
      if (!el.classList.contains('reveal')) el.classList.add('reveal');
      revealTargets.push(el);
    });
  });

  // Index siblings inside a grid so they stagger
  Array.prototype.forEach.call(document.querySelectorAll('.proof-grid, .proof-stats-grid, .service-mix__grid, .schedule__hero, .trust-strip__grid, .contact-grid-2col, .home-base-grid'), function (grid) {
    var i = 0;
    Array.prototype.forEach.call(grid.children, function (child) {
      if (child.classList.contains('reveal')) {
        child.style.setProperty('--reveal-i', i);
        i++;
      }
    });
  });

  if (reduced) {
    // Skip animation; immediately mark every reveal as in-view.
    revealTargets.forEach(function (el) { el.classList.add('is-in'); });
  } else if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    revealTargets.forEach(function (el) { io.observe(el); });
  } else {
    // Old browser — skip animation, show immediately.
    revealTargets.forEach(function (el) { el.classList.add('is-in'); });
  }

  // ----------------- Stat count-up -----------------
  // Any element with data-count-to animates from 0 to that value when its
  // ancestor card enters the viewport. Suffix from data-count-suffix.
  var counters = document.querySelectorAll('[data-count-to]');
  if (counters.length) {
    var startCount = function (el) {
      var target = parseInt(el.getAttribute('data-count-to'), 10);
      var suffix = el.getAttribute('data-count-suffix') || '';
      if (reduced || !isFinite(target)) { el.textContent = target + suffix; return; }
      var duration = 900;
      var start = performance.now();
      var step = function (now) {
        var t = Math.min(1, (now - start) / duration);
        // ease-out-cubic
        var eased = 1 - Math.pow(1 - t, 3);
        var value = Math.round(target * eased);
        el.textContent = value + suffix;
        if (t < 1) requestAnimationFrame(step);
        else el.textContent = target + suffix;
      };
      el.textContent = '0' + suffix;
      requestAnimationFrame(step);
    };
    if ('IntersectionObserver' in window && !reduced) {
      var counterIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            startCount(entry.target);
            counterIO.unobserve(entry.target);
          }
        });
      }, { threshold: 0.5 });
      Array.prototype.forEach.call(counters, function (el) { counterIO.observe(el); });
    } else {
      Array.prototype.forEach.call(counters, function (el) { startCount(el); });
    }
  }

  // ----------------- Mobile nav toggle -----------------
  var nav = document.querySelector('.site-nav');
  var toggle = document.querySelector('.site-nav__toggle');
  if (nav && toggle) {
    var closeNav = function () {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
    };
    var openNav = function () {
      nav.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close menu');
    };
    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      if (nav.classList.contains('is-open')) closeNav(); else openNav();
    });
    document.addEventListener('click', function (e) {
      if (!nav.classList.contains('is-open')) return;
      if (nav.contains(e.target) || toggle.contains(e.target)) return;
      closeNav();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) closeNav();
    });
    Array.prototype.forEach.call(nav.querySelectorAll('a'), function (a) {
      a.addEventListener('click', closeNav);
    });
  }
})();
