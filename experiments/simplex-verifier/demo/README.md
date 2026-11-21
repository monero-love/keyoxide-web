# Demo and captured test output

Captured on **2026-11-21** from source commit `b92fcc1f4c864ecae7207dafd2f845bbeb38c74e`, using Node **22.23.5**. These are outputs from successful runs, not illustrative invented logs.

## Offline verifier demo

The demo uses real disposable OpenPGP keys and a **mock chat transport**. It does not contact SimpleX users or prove chat delivery. Test signing keys and challenge state are deleted after the run. The two identifying digest fields below are explicitly redacted, while the status, timestamp and statement are preserved.

```text
OFFLINE MOCK TRANSPORT — this run makes no assertion of SimpleX delivery.
Sanitized capture: disposable fingerprint and synthetic-address digest replaced.
{
  "result": "checked",
  "checkedAt": "2026-11-21T17:15:54.567Z",
  "primaryFingerprint": "[redacted disposable test-key fingerprint]",
  "verifier": "monero.love/local-poc",
  "addressSha256": "[redacted synthetic-address digest]",
  "statement": "Reached a contact through the claimed address and received a fresh signature from the claimed key."
}
```

The `checked` value demonstrates the verifier's success path with mocked delivery. The statement is the verifier's standard result text, **not evidence of a live chat exchange in this demo**. See [the separate earlier disposable-profile live test](../live-test-results.txt) for that integration check. It was not rerun for this output capture.

## Test results

| Suite | Passed | Failed | Captured output |
| --- | ---: | ---: | --- |
| Keyoxide, including integration/security regressions | 45 | 0 | [Keyoxide output](keyoxide-tests.txt) |
| Standalone verifier | 35 | 0 | [Verifier TAP output](verifier-tests.tap) |
| Chromium desktop and mobile | 2 | 0 | [Browser output](browser-tests.txt) |
| **Total** | **82** | **0** | |

The Keyoxide command also passed Standard, ESLint and Biome. Browser checks ran against already-built assets, verifying explicit consent, request export, exact signed claims and no external requests. Test names and timings are preserved. Terminal color escapes and any checkout path are removed from the captured output. Browser output includes a harmless color-environment warning.

Verifier coverage includes success, valid signing subkeys, wrong keys, changed addresses, expiry, replay, wrong chat, no response, malformed transport data and private one-use state. The source tree contains no test signing keys, real contact addresses, challenge nonces, signature replies or chat transcripts from these runs.

## Reproduce

From the repository root, with Node 22.23.5 and GnuPG installed:

```sh
npm ci --ignore-scripts
npm ci --ignore-scripts --prefix experiments/simplex-verifier
npx playwright install chromium
node experiments/simplex-verifier/demo.js
npm test
npm run test:verifier
npm run build
npm run test:browser
```

[commands.json](commands.json) records the exact capture commands and their exit codes. [offline-output.txt](offline-output.txt) contains the sanitized demo output. Timestamps, disposable fingerprints and timings will differ on reruns. This demo performs no live chat test, deployment, upload of verification results or badge creation.
