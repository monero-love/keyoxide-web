# Onion profile proofs: rc5

Deployed on 2026-11-24. Running revision `93bda4eb713f9952c42e5f7b54e0c9c7dc4ba04e`, version `5.1.0-simplex.1-rc.5`. Later evidence commits do not change that runtime revision.

The [onion proof guide](https://keyoxide.net/onion) covers OpenPGP and ASP setup. Profiles claim a full v3 onion URL ending in `/.well-known/keyoxide.txt`. The website publishes a complete direct identity-proof line. A consenting browser asks this instance to retrieve the file through Tor, then compares the result with the signed profile's identifier. The browser explicitly discloses its reliance on the instance's retrieval. Nothing is fetched from an onion site on profile load, and no permanent badge is issued.

## Captured verification

The [release output](onion-evidence/release-gate.log) records 67 application tests, 35 SimpleX verifier tests and 8 desktop/mobile browser tests passing: 110 total. Tests cover v3 checksum/version validation, exact paths, local-DNS avoidance, matching and wrong identity proofs, signed ASP compatibility, cached-success reset, explicit consent, redirects, HTML/compression rejection, response limits, invalid UTF-8, truncation, timeout, concurrency and quotas. Browser tests also retain SimpleX opt-in and ordinary GitHub/DNS proof coverage, and check mobile layout after success and failure.

Dependency audits and candidate image/source scans reported zero vulnerabilities or secret findings. Container configuration, HTTPS rehearsal and native packaging checks passed. See the [audit summary](onion-evidence/audit-summary.json). This audit covers the candidate, not the retained legacy backend or the host OS.

The [live check output](onion-evidence/live-checks.log) records both OpenPGP and ASP verification through the deployed browser assets and API over a real Tor circuit. The signed profiles were disposable fixtures rendered locally into the browser, not publicly published profiles. Their matching proof lines were served by a separate, temporary onion service under our control. No third-party onion service or live SimpleX contact was contacted. Temporary Tor/HTTP services, onion keys, proof files and local public fixtures were removed after testing. OpenPGP signing keys were removed immediately after fixture generation, and ASP signing keys existed only in the local fixture process.

One live retrieval failed closed during verification. Rechecks through both candidate APIs and the complete browser flow passed. Tor availability is not guaranteed, and a failed fetch must not produce a verified result.

The existing homepage text and section order remain unchanged. Navigation and the guide passed live checks at 1280, 390 and 320 pixels. The guide also loaded through the site's actual onion address without analytics.

## Deployment boundary and rollback

Both candidate services remain enabled at boot and monitored, with zero automatic restarts at the final check. The narrow firewall exception permits only the application UID's TCP connection to the existing loopback Tor port. A live check confirmed that unrelated loopback access remains blocked. The exact onion API location has a 30-second nginx read timeout for a bounded 20-second fetch. The retained `/api/`, actor and legacy signature routes are unchanged.

A timed rollback guard was used for each update and canceled after the live checks passed. Previous releases, config backups and explicit rollback scripts remain privately on the host. See the [site runbook](../../deploy/KEYOXIDE-NET.md).

## Separate legacy issue observed

A compatibility probe briefly received HTTP 502 from the retained DNS proof API. The legacy web process had restarted on an unhandled IRC client error (`ERR_UNHANDLED_ERROR`). The DNS probe passed on recheck. This existing backend is separate from the new onion checker and was not modified in this release. Its IRC error handling remains an outstanding reliability issue, so this report does not claim that the whole legacy proof service is free of faults.
