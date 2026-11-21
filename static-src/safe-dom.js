// SPDX-License-Identifier: AGPL-3.0-or-later
// Build links as DOM nodes, never by interpolating profile-controlled HTML.
export function setSafeLink(container, label, uri, attributes = {}) {
    container.textContent = label;
    if (typeof uri !== 'string') return;
    let url;
    try { url = new URL(uri); } catch { return; }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return;
    const link = document.createElement('a');
    link.textContent = uri;
    link.href = uri;
    for (const [name, value] of Object.entries(attributes)) link.setAttribute(name, value);
    container.append(link);
}
