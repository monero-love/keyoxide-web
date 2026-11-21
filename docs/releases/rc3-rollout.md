# rc3: visible SimpleX instructions

Deployed on 2026-11-21. Running revision: `4c84e45090751293ace25c3e2f6a72394d3a24e6`, version `5.1.0-simplex.1-rc.3`.

The [SimpleX guide](https://keyoxide.net/simplex) is linked near the top of the homepage, in the site footer and beside SimpleX claims. It explains signed notation setup, local request export, verifier setup, challenge signing, private addresses, the meaning of a result and rechecking after rotation. Long commands wrap on mobile screens. The beta remains a manual local workflow with no hosted bot or public badge.

## Validation and rollout

- 55 application, 35 verifier and 6 browser tests passed.
- Dependency, candidate image and source secret scans reported zero findings.
- Container configuration, HTTPS rehearsal and native bundle checks passed.
- Additional desktop/mobile checks passed homepage-to-guide navigation and responsive layout locally and on public HTTPS.
- The actual Tor address served the new guide without analytics.
- Both candidate services passed exact revision and guide checks before rollout completion. Existing proof services and nginx routing were preserved.

The prior native release remains available for rollback. The automatic rollback guard was canceled after live checks passed. No SimpleX users were contacted. This documentation record is a later commit than the deployed application.

Native bundle SHA-256: `4a9fa35583ed8be8acf5d3db01e0eaa2d5accfc98f2d3c1a51a3eb1e8d8366ed`.
