// SPDX-License-Identifier: AGPL-3.0-or-later
(() => {
  if (location.hostname !== 'keyoxide.net') return;
  if (navigator.globalPrivacyControl || navigator.doNotTrack === '1') return;
  try { if (localStorage.getItem('plausible_ignore') === 'true') return; } catch (_) {}
  const path = location.pathname;
  const publicPages = new Set(['/', '/apps', '/privacy', '/util', '/util/', '/util/wkd', '/util/qrfp', '/util/qr', '/util/profile-url', '/util/bcrypt', '/util/argon2']);
  const page = publicPages.has(path) ? path : '/profile';
  window.plausible = window.plausible || function () {
    (window.plausible.q = window.plausible.q || []).push(arguments);
  };
  window.plausible('pageview', { u: 'https://keyoxide.net' + page });
})();
