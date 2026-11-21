// SPDX-License-Identifier: AGPL-3.0-or-later
(() => {
  const form = document.querySelector('#search form');
  if (!form) return;
  form.addEventListener('submit', event => {
    event.preventDefault();
    const identifier = form.querySelector('input[type="search"]').value;
    window.location.href = '/' + encodeURIComponent(identifier);
  });
})();
