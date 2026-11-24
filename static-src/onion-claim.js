// SPDX-License-Identifier: AGPL-3.0-or-later
import { parseOnionClaim, onionProofIdentifier, matchesOnionProof } from '../src/shared/onion.js';

export function renderOnionClaim(root, claim) {
    root.setAttribute('data-skip', 'true');
    root.setAttribute('data-status', 'unchecked');
    const subtitle = root.querySelector('.info .subtitle');
    root.querySelector('.info .title').textContent = 'Onion website';
    subtitle.textContent = 'Not checked';
    root.querySelector('.info img').setAttribute('src', '/static/img/link.svg');
    const content = root.querySelector('.content');
    content.replaceChildren();
    const paragraph = text => {
        const p = document.createElement('p'); p.textContent = text; content.append(p); return p;
    };
    const address = document.createElement('code'); address.className = 'simplex-address'; address.textContent = claim.uri; content.append(address);
    paragraph('Check whether this onion website publishes a proof for this profile. Nothing is fetched until you choose to check.');
    const help = document.createElement('a'); help.href = '/onion'; help.textContent = 'Set up an onion website proof'; content.append(help);
    let identifier;
    try { parseOnionClaim(claim.uri); identifier = onionProofIdentifier(claim.proofs?.[0]); }
    catch { paragraph('This check needs a full v3 onion URL ending in /.well-known/keyoxide.txt and a supported OpenPGP or ASP profile.'); return; }
    paragraph('The proof file must contain a complete line with:');
    const proof = document.createElement('code'); proof.className = 'simplex-address'; proof.textContent = identifier; content.append(proof);
    const label = document.createElement('label'); label.className = 'simplex-consent';
    const consent = document.createElement('input'); consent.type = 'checkbox';
    label.append(consent, document.createTextNode(' I agree to send this onion URL to this instance for a Tor check.'));
    content.append(label);
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Check onion proof through Tor'; button.disabled = true; content.append(button);
    const status = paragraph('The instance sees the onion URL. It retrieves the public proof through Tor.'); status.setAttribute('role', 'status');
    let busy = false;
    consent.addEventListener('change', () => { button.disabled = busy || !consent.checked; });
    button.addEventListener('click', async () => {
        if (busy || !consent.checked) return;
        busy = true; button.disabled = true; subtitle.textContent = 'Checking'; root.setAttribute('data-status', 'running');
        const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 25000);
        try {
            const response = await fetch('/onion-proof/check', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({url:claim.uri}), credentials:'omit', cache:'no-store', signal:controller.signal});
            if (!response.ok) throw new Error('Could not fetch proof. The service may be unavailable, busy or rate-limited. Try again later.');
            const data = await response.json();
            if (data.url !== claim.uri || !matchesOnionProof(data.proof, identifier)) {
                root.setAttribute('data-status', 'failed'); subtitle.textContent = 'Proof did not match';
                status.textContent = 'The fetched file did not contain the exact identity proof for this profile.';
            } else {
                root.setAttribute('data-status', 'success'); subtitle.textContent = 'Proof matched via Tor';
                status.textContent = 'The onion site published this profile’s proof when checked. This browser relied on this instance to retrieve it through Tor. This is not a permanent badge or proof of a legal identity.';
            }
        } catch (error) {
            root.setAttribute('data-status', 'unchecked'); subtitle.textContent = 'Not checked';
            status.textContent = error.name === 'AbortError' ? 'The check timed out. No proof was verified.' : error.message;
        } finally { clearTimeout(timer); busy = false; button.disabled = !consent.checked; }
    });
}
