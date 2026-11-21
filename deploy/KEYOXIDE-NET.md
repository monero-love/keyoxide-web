# Site-specific rollout for keyoxide.net

Read-only inspection on 2026-11-21 confirmed a Debian VM, nginx, Node 20.19.2 and the active `keyoxide@web` / `keyoxide@onion` systemd services. The existing source base is `b95841126b2644352ea1027cc87c82eae14d1a7a`. Docker is not required for the live host. Private SSH configuration and infrastructure addresses are intentionally excluded from this repository.

## Preserve the existing services

The production site has configured account-backed proof verifiers, an ActivityPub signing actor, first-party analytics, certificate renewal, an onion service and monitoring. The standalone candidate does not replace all of these services.

The rollout therefore keeps both existing services running on ports 3000/3001 and starts candidate web/onion services on 3300/3301. nginx sends profile pages, utilities and candidate assets to the new services while retaining:

- `/api/` on the existing proof backends, including Matrix, Telegram, IRC, XMPP, signed ActivityPub, OpenPGP, ASP, GitLab and GraphQL behavior.
- `/users/keyoxide` and `/.well-known/webfinger` on the existing signing actor.
- `/sig`, its `v=perf1` assets and its source archive on the existing service.
- Existing analytics locations, HTTP challenge renewal route, TLS configuration, HTTP/2, compression, onion listener and monitoring includes.

The candidate retains the site's lightweight homepage, versioned assets, onion link and privacy policy. Existing analytics are explicitly enabled only for the HTTPS instance, remain first-party, mask profile identifiers and honor DNT/GPC/opt-out settings. No analytics are added to onion pages.

The candidate runtime and source are audited separately. Keeping the existing proof backend does not upgrade or certify that backend. Its credentials, signing keys and existing egress firewall protections remain untouched. The new restricted proxy is available for standalone deployments, but is not substituted for the configured production verifiers during this rollout.

## Prepare the release

Run `scripts/prepare-deployment.py` locally from a clean commit. In addition to the container artifact, it produces `native-release.tar.gz` containing the exact audited application, production dependencies, source archive and a pinned Node 22.23.5 glibc runtime with its license. The exporter rejects native addons and smoke-tests the native layout on glibc as an unprivileged user. It does not upgrade `/usr/bin/node` or alter the old application's runtime.

Use the existing trusted SSH connection for the Keyoxide VM. After deployment is explicitly authorized, transfer the bundle and its checksums. Verify `SHA256SUMS` before extraction. Extract the native bundle to a new immutable release directory such as `/opt/keyoxide-candidate/releases/REVISION`. Keep it root-owned and world-readable, with executable directories and runtime binary. Link `/opt/keyoxide-candidate/current` to that directory. Do not overlay `/opt/keyoxide`.

Install `deploy/keyoxide-candidate@.service` as a new unit. It uses the existing unprivileged `keyoxide` identity, so the existing per-UID egress firewall still applies. It imports only the non-secret web/onion environment files plus the new release metadata and candidate settings. It never imports the credential or proof-signing environment files.

Create root-owned mode-0600 files:

`/etc/keyoxide/candidate-web.env`:

```dotenv
PORT=3300
ENABLE_ANALYTICS=true
RATE_LIMIT_MAX=60
```

`/etc/keyoxide/candidate-onion.env`:

```dotenv
PORT=3301
ENABLE_ANALYTICS=false
RATE_LIMIT_MAX=600
```

Tor's local transport hides individual client addresses, so its quota is intentionally a shared, higher ceiling rather than falsely claiming per-user IP limits. HTTPS uses exact loopback proxy trust and nginx overwrites forwarding headers. Both candidate app listeners bind only to loopback.

Reload systemd's unit definitions and start only `keyoxide-candidate@web` and `keyoxide-candidate@onion`. Check both loopback `/healthz` endpoints against `manifest.json` and confirm the original two services are still active. Candidate Node starts from `current/node/bin/node`, never the host's Node 20 executable.

## Prepare the routing diff

Save the current `/etc/nginx/sites-available/keyoxide` privately and retain its hash. Render a candidate without installing it:

```sh
python3 scripts/prepare-site-cutover.py /private/path/current-keyoxide.conf \
  > /private/path/candidate-keyoxide.conf
diff -u /private/path/current-keyoxide.conf /private/path/candidate-keyoxide.conf
```

The renderer fails closed if the inspected routing layout has changed. It changes the two page upstreams and static routing, adds exact legacy actor/signature/source routes, and overwrites forwarding headers. It leaves API blocks and all existing TLS, analytics, ACME and onion configuration intact. Do not use the generic nginx template to replace this live virtual host.

The actual proposed routing diff was syntax-tested using the live nginx binary and memory-only config files. No config file was installed and nginx was not reloaded during preparation. Revalidate immediately before rollout in case the site has changed.

After reviewing the diff and starting both candidate services, install only the candidate virtual-host file, run `nginx -t`, and reload nginx. Preserve the saved original config. Check HTTPS and onion pages, ordinary proofs, existing actor endpoints, first-party analytics opt-outs, candidate source download and explicit SimpleX request export. Verifying a SimpleX contact still requires that operator's opt-in.

## Rollback

Restore the saved nginx virtual-host config, validate it and reload nginx. All requests return to the still-running original services and their original assets. Verify HTTPS and onion operation, then stop only the two candidate services. Do not stop the original proof backends, change the Tor identity, rotate signing keys, alter firewall rules, or roll back verifier challenge state.

Monitor the candidate units as well as the existing units. Existing nginx aggregate counters continue to cover all requests. Add candidate unit names to the existing systemd exporter allowlist during the authorized rollout, preserving its current entries. The application exposes revision-aware `/healthz` without logging profile paths or consuming rate-limit quota.
