/**
 * Theme switcher (Dark / Light mode) with localStorage persistence
 */
(function () {
  'use strict';

  var THEME_KEY = 'slview.theme';

  function store(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }
  function load(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function syncThemeButton() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    var btn = document.getElementById('theme-btn');
    if (!btn) return;
    var svg = btn.querySelector('svg');
    if (svg) {
      svg.setAttribute('data-i', dark ? 'sun' : 'moon');
      if (window.paintIcons) window.paintIcons(btn);
    }
    btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme');
    var next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    store(THEME_KEY, next);
    syncThemeButton();
    // Dispatch custom event so uPlot can refresh its theme colors
    window.dispatchEvent(new CustomEvent('themechanged', { detail: { theme: next } }));
  }

  // Initial setup
  var initial = load(THEME_KEY);
  if (!initial) {
    initial = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', initial);

  document.addEventListener('DOMContentLoaded', function () {
    syncThemeButton();
    var btn = document.getElementById('theme-btn');
    if (btn) btn.addEventListener('click', toggleTheme);
  });

  window.Theme = {
    toggle: toggleTheme,
    get: function () { return document.documentElement.getAttribute('data-theme'); }
  };
})();

