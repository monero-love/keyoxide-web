# SimpleX local verification integration

This development branch renders SimpleX identity claims, suppresses automatic proof requests for them, and offers an explicit local verification handoff. The profile handoff is deployed on keyoxide.net. Read the [on-site guide](https://keyoxide.net/simplex). No public badge or hosted verifier service is created.

## Use the handoff

Open an OpenPGP profile containing a SimpleX claim and expand its **SimpleX link [Not checked]** row. Review the exact link. Select the local-save consent checkbox, then choose **Save local verification request**. The browser saves `simplex-verification-request.json` containing the address, claimed primary fingerprint and armored public key. It does not contact SimpleX or upload the request.

In `experiments/simplex-verifier`, follow the [verifier setup instructions](../experiments/simplex-verifier/README.md), start a disposable verifier profile with the SimpleX CLI, and run:

```sh
node cli.js --request simplex-verification-request.json ws://127.0.0.1:5225 1 .local/challenges
```

Confirm the primary fingerprint independently before running the command. The CLI validates the signed notation before opening the local WebSocket. It then connects through the exact address, sends a fresh challenge and waits for a locally produced detached OpenPGP signature in the same direct chat. Existing positional CLI arguments remain supported.

Private addresses are opt-in. The request is a local file containing the address and public key, not a proof or attestation. Keep it private and remove it when no longer needed. The page remains **Not checked** after saving. No result is uploaded or persisted in the Keyoxide profile.

Only full contact-address forms and OpenPGP profiles support export. Invitation links, short links and ASP profiles remain visible but have no export action. Group links can share the contact-link syntax, so actual classification happens in the SimpleX engine before the verifier connects. This frontend does not claim that a syntactically matching link is a reusable address.

## Build and preview locally

Use Node 22.23.5, recorded in `.nvmrc`, and GnuPG. Tests use Node's built-in runner. Release artifacts and the supported production boundary are described in [the release audit](releases/simplex-rc1.md).
```sh
npm ci --ignore-scripts
npm test
npm run build
npm ci --ignore-scripts --prefix experiments/simplex-verifier
npm test --prefix experiments/simplex-verifier
npm run preview:simplex
```

The preview requires GnuPG. It serves only `http://127.0.0.1:3325` with a disposable signed public key and synthetic non-routable address. The temporary GnuPG home is removed before the server starts. No live users are contacted. Stop the preview with Ctrl-C.

For a live transport test between two disposable profiles, follow the separate verifier README. That test is explicitly invoked and is not part of page initialization, `npm test`, or the build.

## Implementation boundary

- `src/shared/simplex.js` identifies reserved SimpleX links without changing their bytes.
- `src/server/claimVerification.js` removes generic web-provider matches and leaves these claims at doipjs status 301 (no matching public-proof provider). Both profile parsing and API verification use this policy. Imported or cached successful statuses are cleared for SimpleX.
- `views/profile.pug` renders unmatched SimpleX claims with `data-skip` and a neutral status. `static-src/kx-claim.js` also guards direct verification calls, so removing the HTML skip attribute cannot trigger a SimpleX proof fetch.
- `static-src/simplex-claim.js` implements the explicit consent and local download. Addresses are rendered as text. Inline public-key serialization also escapes HTML delimiters without altering decoded bytes.
- `experiments/simplex-verifier/src/request.js` defines the shared, versioned browser/CLI input envelope. The cryptographic verifier treats that envelope as untrusted input and independently validates the signed claim.
- `/api/3/profile/verify` now parses the profile with `Profile.fromJSON`, replacing the upstream invalid `Claim.fromJson` call. Malformed profile data returns 400, and ordinary proof-fetch failures return an error rather than leaving a promise unresolved.

No SimpleX engine change is needed. The companion [SimpleX branch](https://github.com/monero-love/simplex-chat/tree/work/keyoxide-address-verifier/bots/keyoxide-verifier.md) records the API contract.

## Validation

On 2026-11-21, 45 Keyoxide tests and 35 verifier tests passed. The production bundle passed Chromium desktop and mobile tests for exact signed claims, explicit consent, download behavior and absence of external requests. Standard, ESLint and Biome passed. The real two-profile transport test was rerun successfully, including a signing subkey and replay rejection. Temporary keys and databases were deleted.

Run `npm run check:release` after installing both lockfiles and Playwright Chromium (`npx playwright install chromium`). Live testing is separate and never automatic. See the release audit for dependency, image, secret and container checks. No transcripts or signing keys are included.

Success still means the verifier reached a contact through that address and received a fresh signature from the claimed key. A future public badge would be a separate attestation labeled “SimpleX address checked by monero.love on [date]”. It would not independently prove chat delivery. Address rotation requires updating the signed notation and checking through the new address using a fresh connection.
