// SPDX-License-Identifier: AGPL-3.0-or-later
import { createRequest } from '../experiments/simplex-verifier/src/request.js';

export function renderSimplexClaim(root, claim) {
    root.setAttribute('data-skip', 'true');
    root.setAttribute('data-status', 'unchecked');
    root.querySelector('.info .title').textContent = 'SimpleX link';
    root.querySelector('.info .subtitle').textContent = 'Not checked';
    root.querySelector('.info img').setAttribute('src', '/static/img/link.svg');
    const content = root.querySelector('.content');
    content.replaceChildren();
    const paragraph = text => {
        const element = document.createElement('p');
        element.textContent = text;
        content.append(element);
        return element;
    };
    paragraph('This link has not been checked. A local verifier can connect through a reusable address and ask the claimed key to sign a fresh challenge.');
    const address = document.createElement('code');
    address.className = 'simplex-address';
    address.textContent = claim.uri;
    content.append(address);
    paragraph('Saving a request does not contact anyone. The local verifier checks the signed profile and rejects invitation links, groups and names.');

    let request;
    try {
        const key = JSON.parse(document.querySelector('kx-key')?.getAttribute('data-keydata') || 'null');
        request = createRequest(claim, key);
    } catch (_error) {
        paragraph('Local checking requires a full contact address and its matching OpenPGP public key. Short links, invitations and ASP profiles are not supported in this version.');
        return;
    }
    const label = document.createElement('label');
    label.className = 'simplex-consent';
    const consent = document.createElement('input');
    consent.type = 'checkbox';
    label.append(consent, document.createTextNode(' I agree to save this address and public key locally for an explicit check.'));
    content.append(label);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Save local verification request';
    button.disabled = true;
    consent.addEventListener('change', () => { button.disabled = !consent.checked; });
    const status = paragraph('Keep private addresses and this request file private.');
    status.setAttribute('role', 'status');
    button.addEventListener('click', () => {
        if (!consent.checked) return;
        const blob = new Blob([JSON.stringify(request, null, 2) + '\n'], {type:'application/json'});
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'simplex-verification-request.json';
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        status.textContent = 'Request saved locally. The address is still not checked. No SimpleX connection was started.';
    });
    content.insertBefore(button, status);
    const steps = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Run the local check';
    steps.append(summary);
    const help = document.createElement('p');
    help.textContent = 'In experiments/simplex-verifier, start a disposable verifier profile with the SimpleX CLI on loopback port 5225, then run:';
    const command = document.createElement('pre');
    command.textContent = 'node cli.js --request simplex-verification-request.json ws://127.0.0.1:5225 1 .local/challenges';
    const explanation = document.createElement('p');
    explanation.textContent = 'Confirm the primary fingerprint independently before running the command. The operator accepts the contact request, reviews the challenge and signs it locally with GnuPG, then replies with the detached signature in that same 1:1 chat. See the verifier README for setup and signing instructions.';
    steps.append(help, command, explanation);
    content.append(steps);
    paragraph('A successful check records what that verifier observed. It is not independently verifiable proof of chat delivery. After address rotation, update the signed claim and check the new address through a fresh connection.');
}
