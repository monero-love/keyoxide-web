# Upstream findings and proposed integration

Inspected on 2026-11-21. Exact revisions are in `upstream-lock.json`. The source checkouts in `upstream/` are inspection copies, not forks or production edits.

| Project | Pinned commit |
| --- | --- |
| keyoxide-web | `b95841126b2644352ea1027cc87c82eae14d1a7a` |
| doipjs | `6c128062b558faf60333f7a70181925e0e7dcadd` |
| simplex-chat stable | `cb4b50db169a2638c78e0b41730d5759c559b473` |

## Claim format that survives existing parsing

Use a human-readable OpenPGP UID self-certification notation:

```text
proof@ariadne.id=<EXACT_REUSABLE_FULL_SIMPLEX_ADDRESS>
```

`proof@metacode.biz` is also recognized. This is a signed claim, not the challenge response and not a public chat-delivery proof.

In [doipjs openpgp.js](https://codeberg.org/keyoxide/doipjs/src/commit/6c128062b558faf60333f7a70181925e0e7dcadd/src/openpgp.js), `parsePublicKey` selects each UID's newest self-certification and decodes those notation values into `Claim`. [claim.js](https://codeberg.org/keyoxide/doipjs/src/commit/6c128062b558faf60333f7a70181925e0e7dcadd/src/claim.js) checks `valid-url.isUri`, retains the constructor string, and exports it as `uri` in version-2 JSON. `Claim.fromJSON` expects a parsed object despite the string example in its documentation. Its URI setter trims whitespace, so this POC rejects whitespace rather than relying on a setter or normalization.

`node scripts/upstream-check.js` tested real GnuPG self-certifications against the pinned doipjs code and lockfile dependencies. Both `https://simplex.chat/contact#...` and `simplex:/contact#...` survive parsing, matching and JSON round trip byte-for-byte. The test's scheme variants are separate signed claims. The verifier never converts between them.

The HTTPS test gets status 101 with ambiguous matches for Forem, Forgejo, Gitea, ActivityPub and Owncast. The `simplex:` test gets status 301, no matches. Neither has a native SimpleX verifier. Recognition, rendering and verification are different from preservation. This finding covers the inspected web/doipjs path, not every mobile or third-party Keyoxide client.

`keyoxide-web/src/server/index.js`, `processOpenPgpProfile`, retains `Claim` instances, calls `match()` and sorts them. `static-src/kx-claim.js` reconstructs the JSON and calls `claim.verify()`. `static-src/keyoxide.js` automatically verifies claims during initialization unless the element has `data-skip`. The API's `src/api/v3/keyoxide_profile.js` also has a bulk verification path.

Provider hooks are `reURI` and `processURI` exported by modules registered in `src/serviceProviders/index.js`. `Claim.verify` fetches a provider's proof, runs proof comparison and can invoke `functions.validate` and `functions.postprocess`. These hooks assume fetchable proof material. A chat challenge must not be slipped into them, because that could initiate contact during page rendering or bulk verification.

The POC does not trust parsed claims alone. It independently verifies the exact UID certification, primary key validity, revocations and address bytes before making a connection. It deliberately does not fall back to an older self-certification that might contain a rotated address.

## SimpleX API evidence

The [connection guide](https://simplex.chat/docs/guide/making-connections.html) distinguishes one-time invitations, optional reusable addresses and group connections. Address deletion or rotation does not invalidate existing chats.

Read the pinned [bot API overview](https://github.com/simplex-chat/simplex-chat/blob/cb4b50db169a2638c78e0b41730d5759c559b473/bots/README.md), [commands](https://github.com/simplex-chat/simplex-chat/blob/cb4b50db169a2638c78e0b41730d5759c559b473/bots/api/COMMANDS.md), [events](https://github.com/simplex-chat/simplex-chat/blob/cb4b50db169a2638c78e0b41730d5759c559b473/bots/api/EVENTS.md), and [types](https://github.com/simplex-chat/simplex-chat/blob/cb4b50db169a2638c78e0b41730d5759c559b473/bots/api/TYPES.md).

The adapter uses correlated `{corrId, cmd}` messages over loopback WebSocket. `/_connect plan` returns `invitationLink`, `contactAddress` or `groupLink`. Only a fresh `contactAddress` with plan `ok` and unchanged `connFullLink` proceeds. `/_connect` must return `sentInvitation`, a pending connection with `viaContactUri`, and no group link. Its `pccConnId` must equal the `contactConnected` event's `contact.activeConn.connId` for the same local user. The verifier then sends with `/_send @<contactId> json ...` and accepts only `newChatItems` with direct chat, the same user/contact/connection IDs, received text content, and a detached PGP signature. Correlated send echoes cannot become received proofs.

Full address bytes are compared exactly. Link classification is delegated to the real SimpleX engine. Short links and names are outside this POC. Long group links can share the `/contact` prefix, which is why a prefix check alone is never treated as classification. The adapter also rejects business/group connections and known-contact shortcuts.

The CLI WebSocket API has no authentication. This POC restricts it to loopback and assumes a trusted local machine and an exclusively used disposable verifier database. No external WebSocket endpoint is supported. It has 60-second command/connection timeouts and a maximum ten-minute challenge lifetime, defaulting to five minutes.

## Original integration proposal and current implementation

The presentation change and explicit local handoff described in steps 1–2 are now implemented on the development branch. See [the integration guide](../../docs/simplex-verifier.md). Steps 3–4 remain future work. No doipjs chat fetcher was added.

1. In the profile-processing/rendering path, identify the supported SimpleX URI forms without modifying `claim.uri`. Preserve the signed claim and display “SimpleX address — not checked”. Set `data-skip` for this claim and exclude it from API bulk verification, preventing the current generic HTTPS providers from trying it automatically.
2. Add an explicit opt-in action to export the exact address and signed public key for this local verifier. Opening a profile must never create a SimpleX connection. No public server is required for this first integration.
3. If a service is later approved, build a separate authenticated, rate-limited challenge endpoint and explicit consent flow. Store any attestation separately from doipjs's public-proof VERIFIED status. Bind it to the exact address, primary fingerprint, verifier identity, check date and validity period. Never treat a static profile description or copied address as proof.
4. Display a verifier attestation only with the label “SimpleX address checked by monero.love on [date]”. Explain that a signature proves the key signed the challenge while chat delivery is vouched for by the verifier. A public attestation would need the verifier's own signing/authentication and a documented recheck policy. Private addresses remain opt-in and unpublished.

A later display-only doipjs provider could improve labels, but would need an explicit non-automatic verification capability first. The smallest initial change therefore stays in keyoxide-web's UI/API skip paths and does not alter doipjs verification semantics.

## Scope and remaining limits

The standalone public-key verifier, real local WebSocket transport, manual signing workflow and mocked tests are implemented. The two-profile smoke harness automates only its disposable operator's signing step to make delivery reproducible. It is not an unattended signing agent for real keys.

Nonce state uses exclusive file creation, a consumed marker and filesystem synchronization. A reply attempt in the bound chat consumes the challenge before cryptographic verification, including invalid replies. Concurrent or restarted verifier instances cannot reuse that challenge. Wrong-chat events are ignored. Timeouts and transport failures fail closed. State assumes a trusted local filesystem and clock. Rollback of the entire state directory or clock, key-compromise recovery, public attestation signing, service authentication, rate limiting and privacy-preserving retention automation are outside this local POC.

[Keyoxide's claims/proofs explanation](https://docs.keyoxide.org/wiki/identity-claims-proofs/) describes publicly verifiable bidirectional links. This interactive SimpleX check has a different evidence boundary and must be labeled accordingly.
