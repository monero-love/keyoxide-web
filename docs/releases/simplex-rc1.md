# SimpleX release candidate audit

Release candidate: Keyoxide `5.1.0-simplex.1-rc.1`, standalone verifier `0.1.0-rc.1`. Audit date: 2026-11-21. This is an implementation review and automated audit, not an independent penetration test. Nothing has been deployed or published. There is no public verification service or badge.

## Supported release boundary

A user explicitly saves a local request from an OpenPGP profile, then runs the local verifier. The verifier validates the latest signed UID claim, asks SimpleX to classify the exact link as a fresh reusable contact address, and connects through it. A fresh versioned challenge binds the address, primary fingerprint, verifier identity, 256-bit nonce and expiry. Only a valid detached signature from that same direct user/contact/connection is accepted. Signing subkeys are validated. Consumption is durable and exclusive, including failed attempts. Consumed records retain only the nonce tombstone.

This proves that the verifier reached a contact through the address and received a fresh signature from the claimed key. It does not independently prove delivery to third parties or prevent cooperating parties from relaying a challenge. Any later public badge would be an attestation labeled **“SimpleX address checked by monero.love on [date]”**. Private addresses require opt-in. Address rotation requires a new signed claim and fresh connection check. No automatic checks run on page load.

## Findings and fixes

| Finding | Resolution |
| --- | --- |
| Vulnerable application and development dependencies | Updated locked dependencies. Root and verifier npm audits include development dependencies and report zero advisories. OpenPGP 6.3.3 supplies both Keyoxide and the verifier, with ws 8.23.0 for local transport. The deprecated OpenPGP 5 branch is removed through a tested dependency override. |
| Browser used stale bundled doip dependencies | Bundle doip source with minimal browser fetchers and copy the patched OpenPGP asset. |
| Untrusted values interpolated into HTML and QR handlers | Build links with DOM APIs, restrict link schemes, and use event listeners. Escape inline public-key JSON. |
| Unrestricted server profile fetches | Restrict to public HTTPS port 443, validate all DNS answers, pin resolved socket addresses, revalidate redirects, cap response size and total time, bypass proxy environment variables. |
| Legacy proof/proxy fetchers bypassed the safe fetch boundary | Disable proxy and server proof verification. Production startup refuses their enable flags. Disable legacy signature profiles. This is an intentional compatibility change. |
| Unverified UID certification could display a forged claim | Verify the exact latest self-certification before retaining its claims, without falling back to a stale claim. |
| Unbounded transport events and local file inputs | Bound payloads, queues, command deadlines and regular-file reads. Reject unsafe WebSocket destinations and malformed responses. |
| State could be shared, followed through symlinks, or retain private addresses | Enforce owned private state, no-follow files, exclusive creation, fsync and sensitive-record deletion on consumption. |
| Vulnerable base OS and unused bundled package managers | Replace Debian runtime with pinned Alpine Node and pinned patched system libraries. Remove npm, Corepack and Yarn from runtime. Build stages remain separate. |
| Public fork source link pointed upstream | Ship corresponding source in the image and serve `/source.tar.gz`. |
| Secret scanner flagged a public ASP identifier | Narrow documented allowlist for the exact public identifier in `views/apps.pug`. No credential exclusions. |

## Checks

- 45 Keyoxide tests, 35 standalone verifier tests, Standard, ESLint, Biome and source-license checks pass. Source notices accept SPDX or the existing full AGPL header and exclude generated files and dependencies.
- Production ncc and webpack builds pass. Webpack reports asset-size/runtime-chunk performance warnings, not build failures.
- Chromium desktop and Pixel 7 viewport tests pass against built assets. They verify explicit consent, exact bytes, signed-claim revalidation, neutral status, no horizontal overflow, no browser errors and no external requests.
- Two fresh disposable SimpleX CLI 7.1.4 profiles completed actual address connection, challenge delivery, local GnuPG signing-subkey signature reply and verification. Replay was rejected. Databases and signing keys were deleted, with no transcript retained.
- Adversarial tests cover wrong key, changed address, replay, expiry, no response, malformed payloads, transport disconnect, event floods, state permissions/symlinks/tampering, forged certification, SSRF DNS/redirects and oversized streams, DOM injection and bounded file input.
- Container smoke checks cover health, homepage and utility rendering, corresponding-source archive, disabled legacy APIs, UID 1000, Node 22.23.5, read-only root filesystem and graceful shutdown.
- Gitleaks 8.30.1 scans the tracked and new nonignored source tree with redacted output. No secrets remain after the narrow public-ID exception. This is not a scan of every historical upstream commit.
- Trivy 0.76.2 audits the runtime image and Dockerfile. Dockerfile configuration scan passes 27 checks with zero failures. Results are recorded in `audit-summary.json`. The exact final image identity is recorded in the local artifact manifest.
- CycloneDX SBOMs, dependency audits, container audit and artifact checksums are generated locally under ignored `release-artifacts/`. They contain dependency metadata, not chat transcripts.

## Reproduce

Use Linux, Node 22.23.5 and GnuPG. Install both lockfiles and the Playwright browser, then run:

```sh
npm ci --ignore-scripts
npm ci --ignore-scripts --prefix experiments/simplex-verifier
npx playwright install chromium
npm run check:release
docker build -t monero-love-keyoxide:simplex-rc1 .
python3 scripts/container-smoke.py monero-love-keyoxide:simplex-rc1
trivy image --scanners vuln --exit-code 1 --severity LOW,MEDIUM,HIGH,CRITICAL monero-love-keyoxide:simplex-rc1
trivy config --exit-code 1 Dockerfile
gitleaks dir . --config .gitleaks.toml --redact
```

The existing Woodpecker validation workflow now uses the pinned runtime and runs the release gate. Remote CI execution has not been observed. It does not publish images or run live chat tests.

The image gate includes lower severities rather than hiding unfixed findings. Refresh advisory databases for each release. Scan a source-only staging tree for Gitleaks to avoid installed dependencies and local user files. The live test is a separate explicit `npm run test:live` in the verifier directory and uses only its own disposable profiles. Verify the CLI hash against `upstream-lock.json` first.

## Operating limits and rollback

The local verifier trusts the host, clock, GnuPG, current public-key export, SimpleX engine and exclusively owned CLI database. Its loopback API is unauthenticated. Do not expose it, share the host with untrusted users or switch active profiles during a check. Re-fetch the key through a trusted channel before rechecking, because the verifier cannot discover withheld revocations. The operator must review the challenge before signing.

Keep request files, pending state and SimpleX history private. Interrupted runs can leave a pending record that requires deletion. Keep nonce tombstones through the expiry window and do not restore a stale state backup during that window. No chat content is written to application logs, but SimpleX retains its own local history unless removed.

The web image has no verifier keys, chat transport or result-publishing endpoint. Use the supplied Compose restrictions. A later deployment needs TLS, an explicit domain, perimeter rate limits and public access to the shipped source archive. The in-process limit intentionally does not trust arbitrary forwarded IP headers. Proxy deployments must account for their shared request budget. HSTS belongs at the TLS edge. CSP blocks framing, objects and base injection but is not a complete script allowlist.

Legacy proxy APIs, server-side provider verification and signature-profile loading are unsupported in this release. Browser public-proof providers remain upstream behavior. Cache-provider environment options no longer apply to the bounded profile fetcher. Do not silently re-enable legacy fetchers to regain compatibility.

Build and retain an immutable image digest and checksums. Rollback means stopping the candidate and starting the previous approved image, without changing user signing keys or publishing checks. There is no application database migration. Never roll verifier nonce state backward. No deployment or rollback operation was performed in this pass.

## GitHub distribution

The `monero-love` repositories preserve pinned upstream history and publish one reviewed downstream changeset. Repository links and local image names use the GitHub namespace. Previous local build artifacts are excluded. Inherited GitHub Actions are disabled on the repositories before the initial push, so importing the source does not deploy or publish anything. The source snapshot and its Git history are checked before upload.
