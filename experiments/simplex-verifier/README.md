# SimpleX ↔ Keyoxide local verifier

Standalone OpenPGP challenge verifier, release candidate 0.1.0-rc.1. Available on the monero-love Keyoxide branch. No public badge, deployed bot, upstream PR, or page-load checks. The live site now offers an explicit local-request handoff. See the [integration guide](../../docs/simplex-verifier.md).

Requires Node.js 22.23.5+ (supported major versions 22–26) and GnuPG. Tested with Node 26.13.1, GnuPG 2.4.9 and SimpleX CLI 7.1.4. Run from `experiments/simplex-verifier`:

```sh
npm ci --ignore-scripts
npm test
npm run demo
```

`demo` uses mocked chat transport and real disposable keys. It does **not** establish real chat delivery. `test-results.txt` records 35 passing automated tests. `live-test-results.txt` records a separate successful test with two actual disposable SimpleX profiles. The opt-in live harness is `node scripts/live-smoke.js`, using `.local-bin/simplex-chat`. It creates temporary databases, contacts only its other test profile, signs locally, then deletes its databases and test keys. It uses public SimpleX relays. It does not save chat transcripts.

See the [captured demo and full test output](demo/README.md) for a sanitized successful offline run and all 82 passing tests.

## Request from Keyoxide

Expand the SimpleX claim, opt in to saving the address locally and download the verification request. Saving makes no connection and does not mark the profile verified. Start the disposable verifier CLI described below, then use:

```sh
node cli.js --request simplex-verification-request.json ws://127.0.0.1:5225 1 .local/challenges
```

The request is untrusted input. The CLI checks the signature on the exact address claim before opening the local transport. Confirm the primary fingerprint independently. Keep private request files local.

## Manual verification

1. On a disposable operator profile, create a reusable **full** SimpleX contact address. Save its exact UTF-8 bytes to `address.txt`, without a trailing newline. Do not substitute a short link, name, invitation or group link.
2. Add that exact string as a human-readable `proof@ariadne.id` notation to the operator key's user-ID self-certification. The legacy `proof@metacode.biz` notation also works. Export the updated **public** key to `public.asc`. See [Keyoxide's notation instructions](https://docs.keyoxide.org/openpgp-profiles/gnupg/). No separate unsigned profile JSON is accepted. Follow only the local notation/export steps for this POC, not the guide’s publication steps.
3. Start a fresh disposable verifier profile in its own private directory. Use an unused loopback port and keep this CLI exclusively on that profile:

```sh
umask 077
mkdir -p .local/verifier
.local-bin/simplex-chat -d .local/verifier/chat -p 5225 --user-display-name POCVerifier
```

4. Run this command in a second terminal, replacing the fingerprint with the independently selected primary-key fingerprint. Use the verifier's numeric user ID, normally `1` for a new database:

```sh
node cli.js public.asc address.txt PRIMARY_FINGERPRINT ws://127.0.0.1:5225 1 .local/challenges
```

5. Accept the verifier's contact request on the operator profile. Review the challenge's address, fingerprint, verifier identity, nonce and expiry. Save the received JSON **exactly**, with its final newline, as `challenge.txt` on the signing machine. Sign it locally:

```sh
gpg --local-user PRIMARY_FINGERPRINT --armor --detach-sign --output reply.asc challenge.txt
```

6. Paste the entire detached signature from `reply.asc` into that same 1:1 chat before the five-minute deadline. Do not upload a private key or paste a clearsigned message. The verifier prints `checked` only after verifying the signature. It accepts valid signing subkeys bound to the claimed primary key.

The public key must have an unexpired, unrevoked valid self-certification containing the exact address. The address check delegates classification to SimpleX's connection-plan API. No URL decoding, case folding, parameter sorting or scheme conversion is performed. The POC rejects known contacts and reconnect shortcuts, so use a fresh verifier profile when repeating a check.

## Meaning and privacy

Success means **the verifier reached a contact through that address and received a fresh signature from the claimed key**. It does not establish a legal identity, exclusive ownership, future reachability or protection against a cooperating relay of the challenge. A signature alone does not independently prove chat delivery.

A future public badge would be the verifier's attestation. Its exact label would be **“SimpleX address checked by monero.love on [date]”**. None is produced here. The local verifier identity is `monero.love/local-poc`, not a public attestation service.

Public Keyoxide claims expose addresses. Private addresses must be explicitly opted in, supplied locally with a signed key export, and never published by default. This tool performs no upload or keyserver lookup. Pending challenge state contains an address and public key, and SimpleX stores local chat history. State directories must be owned by your user with mode 0700. After an attempt, the verifier fsyncs a nonce tombstone and deletes the sensitive record. Interrupted pending checks need manual cleanup. Keep tombstones until all challenges have expired. Use a trusted local filesystem and clock, and do not share the CLI database or switch active profiles during verification. The loopback API has no authentication, so other users on the same host are outside this trust boundary. Keep both directories private and delete them when no longer needed. Do not publish transcripts, signatures, state files or test databases. Signing keys stay on the operator's machine.

After address rotation, update the signed notation and perform a fresh check through the new exact address. Retire any old attestation. Existing chats can survive address deletion, so a reply in an old chat is insufficient for rechecking. Refresh the public key before each check to learn newly available revocations or claim changes. This offline-key POC cannot discover withheld revocations.

See [upstream findings and minimal integration](RESEARCH.md), [pinned commits and binary hash](upstream-lock.json), and [test results](test-results.txt). This release candidate has implementation-level security checks and automated audits, not an independent penetration test. See the [release audit and operating limits](../../docs/releases/simplex-rc1.md).

## Development repositories

- [Keyoxide verifier branch](https://github.com/monero-love/keyoxide-web/tree/work/simplex-address-verifier/experiments/simplex-verifier)
- [SimpleX interoperability branch](https://github.com/monero-love/simplex-chat/tree/work/keyoxide-address-verifier/bots/keyoxide-verifier.md)

These are GitHub imports under `monero-love`, with upstream history preserved and upstream remotes documented. The implementation is published as a single reviewed downstream changeset. Importing does not create native GitHub fork metadata. The original `main` and `stable` branches are unchanged. No live testing runs on checkout or page load.

The optional upstream parsing test needs the pinned doipjs checkout and its dependencies. Run `node scripts/prepare-upstream.js` explicitly to fetch them, then `npm run test:upstream`. For the optional live test, place the CLI from `upstream-lock.json` at `.local-bin/simplex-chat` after checking its SHA-256. The upstream binary and source checkouts are not committed.
