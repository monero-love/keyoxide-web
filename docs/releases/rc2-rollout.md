# rc2 rollout: keyoxide.net

Deployed on 2026-11-21 following explicit operator authorization. The running application revision is `d3bbd32c44bf60af92f2659950ae455f794eedf4`, version `5.1.0-simplex.1-rc.2`. Later evidence commits do not change that runtime revision.

The native bundle SHA-256 was verified before extraction:
`289c4f8340b0d18d8c3c5de3f05b55ba09f66a6b1b69f0dd45e35d3e6f8af815`.

Both candidate systemd services were started and checked before nginx routing changed. The original web/onion services remain running for proof APIs, the signing actor and legacy signature pages. Candidate services are enabled at boot and included in the existing systemd monitoring allowlist. No proof credentials or signing keys were moved or rotated.

## Observed post-cutover checks

```text
PASS candidate web/onion revision, pages, assets, source and analytics isolation
PASS nginx configuration validation and reload
PASS public DNS, HTTPS certificate, health revision, homepage, privacy and utilities
PASS HTTPS and onion listener routing to the exact candidate assets/source
PASS retained API, ActivityPub actor, webfinger, signature page and perf1 assets
PASS actual Tor circuit to the onion health endpoint, exact release revision
PASS public DNS proof transport using monero.love TXT records
PASS live desktop/mobile browser pages, responsive layout and no page errors
PASS both candidate services active with zero restarts at verification
PASS both candidate services enabled at boot and exported as active metrics
PASS original web/onion, nginx and Tor services remain active
```

The first DNS transport probe used `keyoxide.net`, which returned `ENODATA` because that domain has no TXT records. The subsequent `monero.love` probe passed. A request from the VM to its public HTTPS address could not use NAT loopback, so public HTTPS was checked externally and host-local TLS routing was checked against loopback with hostname validation.

A five-minute automatic rollback guard was armed before switching nginx and canceled after external and local routing checks passed. The previous nginx configuration and an explicit rollback script are retained privately on the host. The original services remain available for rollback. See the [rollout and rollback runbook](../../deploy/KEYOXIDE-NET.md).

No live SimpleX contacts were contacted during rollout. No bot or public badge was deployed. Manual checks remain opt-in. The predeployment [test and audit evidence](simplex-rc2.md) is unchanged, and its scope does not certify the retained legacy backend or host operating system.
