# Deployment candidate: 5.1.0-simplex.1-rc.2

Validated on 2026-11-21. The immutable release revision is
`d3bbd32c44bf60af92f2659950ae455f794eedf4`. This report and its exact checksum allowances in the secret scanner are later evidence-only changes, not a new application build.

The [captured release output](rc2-evidence/release-gate.log) records 55 application tests, 35 standalone verifier tests and 6 desktop/mobile browser tests passing. Both npm dependency audits report zero vulnerabilities. Browser coverage includes explicit SimpleX opt-in and ordinary GitHub/DNS proofs through the built assets. Automated chat tests use mocks and do not contact live users.

The candidate source secret scan and container vulnerability scan reported zero findings. The image configuration scan passed. This is a point-in-time automated audit, not a certification of the retained proof backend or host operating system. The build has non-blocking webpack asset-size and runtime-chunk recommendations.

The [HTTPS rehearsal](rc2-evidence/https-rehearsal.log) passed trusted TLS, exact revision, pages/assets/source, proxy restrictions, forwarding-header spoof resistance, independent-client quotas, health availability, and outage/recovery checks. The [native bundle smoke test](rc2-evidence/native-export.log) passed under an unprivileged glibc runtime. Local outage recovery is not a performed production rollback.

Read-only inspection confirmed systemd deployment with separate web/onion services. Both candidate ports were unused, with approximately 3.1 GiB available memory and 20 GiB free disk. Existing services, certificate renewal and monitoring were healthy. The pinned Node 22.23.5 binary ran on the actual VM from memory, and the proposed nginx routing diff passed the live nginx syntax check without installing configuration or reloading services.

Follow the [site-specific deployment and rollback runbook](../../deploy/KEYOXIDE-NET.md). It preserves existing account-backed verifiers, signing actor, onion service and first-party analytics. Candidate service activation and real end-to-end checks after cutover remain rollout steps. No live deployment has occurred.

The [manifest](rc2-evidence/manifest.json) identifies the image and artifact digests. The [checksums](rc2-evidence/SHA256SUMS) apply to the complete local release bundle under `release-artifacts/d3bbd32c44bf`, not to this subset of published evidence. Large image/native archives remain local. No private addresses, signing keys or chat transcripts are included.

SimpleX verification still proves only that the verifier reached a contact through the exact claimed reusable address and received a fresh signature from the claimed key. Any future public badge is the verifier's attestation, not independently verifiable delivery evidence. Private addresses remain opt-in and must be rechecked after rotation. This release does not deploy a bot or publish a badge.
