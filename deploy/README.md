# Deployment package for keyoxide.net

**For the inspected live site, use [the systemd side-by-side rollout](KEYOXIDE-NET.md).** The live site uses systemd and existing account-backed verifiers. The Docker/Compose setup below is an alternative for an isolated standalone beta, not a replacement for its current virtual-host configuration.

This package prepares the audited beta for a Linux host with nginx terminating HTTPS and Docker Compose running the app. It does not change DNS, contact SimpleX users, install services on the live host or deploy automatically. GitHub Actions remain disabled.

## Supported behavior

The beta offers explicit SimpleX request downloads and local manual OpenPGP verification. Browser-based GitHub proofs and DNS proofs have desktop/mobile regression coverage. OpenPGP HKP/WKD parsing and signed ASP profiles are tested. A new restricted proxy supports public HTTPS text/JSON and public-recursive DNS TXT queries. It uses bounded time, response size and concurrency, rejects private destinations and follows the same DNS/redirect checks as profile retrieval.

Legacy authenticated Matrix/Telegram/IRC/XMPP transports, ActivityPub signing, GraphQL proxying, signature profiles and server-wide provider verification remain unsupported. They are not silently re-enabled. If the existing site's users rely on these features, retain the old instance and introduce this beta on a separate hostname until those requirements are addressed.

## Create the immutable bundle

Use Node 22.23.5, GnuPG, Python 3.12+, Docker, Trivy and Gitleaks. Install both npm lockfiles and Playwright Chromium as documented in the release guide. Commit the source and run:

```sh
python3 scripts/prepare-deployment.py
```

This runs the complete release gate, scans a clean source snapshot, builds from that exact commit, checks the container, rehearses HTTPS through nginx, scans the image at every reported severity, generates an SBOM and exports `image.tar`, `source.tar.gz`, `manifest.json`, audit logs and `SHA256SUMS`. Any failed gate stops the process. Output is under the ignored `release-artifacts/<commit>/` directory. Nothing is uploaded or deployed.

The source archive comes from `git archive`, and the image embeds its corresponding source at `/source.tar.gz`. No signing keys, chat databases, local environment files or earlier local build artifacts are included. The image label and `/healthz` expose the exact revision for rollout verification.

## Prepare the host without switching traffic

Before running these commands on the deployment host, record its current image or service revision, nginx config, certificate paths, listener ports and restart command. Keep the previous application running during the candidate check. An unknown predecessor cannot be safely rolled back by a generic script.

Transfer the bundle privately. Verify checksums against the locally retained manifest through a trusted channel:

```sh
cd /path/to/bundle
sha256sum -c SHA256SUMS
docker load --input image.tar
```

Use a dedicated Docker bridge network for the candidate. Choose an unused loopback port, such as 3301. The network must permit public HTTPS egress and DNS to the fixed public recursive resolvers 1.1.1.1 and 1.0.0.1. Do not attach unrelated containers to this network.

```sh
docker network create keyoxide-beta-edge
docker network inspect keyoxide-beta-edge --format '{{(index .IPAM.Config 0).Gateway}}'
```

Create `deploy/candidate.env`, mode 0600, using the image ID from `manifest.json` and the gateway IP printed above:

```dotenv
KEYOXIDE_IMAGE=sha256:REPLACE_WITH_MANIFEST_IMAGE_ID
KEYOXIDE_NETWORK=keyoxide-beta-edge
KEYOXIDE_PORT=3301
KEYOXIDE_DOMAIN=keyoxide.net
TRUST_PROXY_IPS=REPLACE_WITH_EXACT_DOCKER_GATEWAY_IP
```

Only literal trusted proxy IPs are accepted, not broad networks or hop counts. Host nginx normally reaches the published loopback port through the Docker gateway. Verify this for the actual host's networking mode. The app port is bound only to 127.0.0.1. Containers run non-root with a read-only filesystem, bounded memory/CPU/PIDs and rotated logs.

Start the candidate only after deployment is authorized:

```sh
docker compose --env-file deploy/candidate.env -p keyoxide-beta -f deploy/compose.yaml config
docker compose --env-file deploy/candidate.env -p keyoxide-beta -f deploy/compose.yaml up -d --wait
curl --fail http://127.0.0.1:3301/healthz
```

Match the returned revision to the manifest. Verify homepage, utilities and source download locally before routing public traffic. Application health checks are exempt from the request quota and remain available during client rate limiting.

## Review and switch nginx

Render a proposed config without installing it:

```sh
python3 scripts/render-nginx.py \
  --domain keyoxide.net --upstream 127.0.0.1:3301 \
  --certificate /etc/letsencrypt/live/keyoxide.net/fullchain.pem \
  --private-key /etc/letsencrypt/live/keyoxide.net/privkey.pem \
  > /tmp/keyoxide-candidate.conf
```

Adjust certificate paths to the existing host. Certificates are never copied into the image or repository. Retain the existing certificate-renewal mechanism. The template expects nginx directly on the public edge. A CDN or additional reverse proxy requires a separately reviewed real-client-IP configuration. Never enable unrestricted `trust proxy` or append an untrusted `X-Forwarded-For` chain.

After reviewing the diff against the existing virtual host, replace only that virtual host's config, run `nginx -t`, and reload nginx. Do not overwrite the whole nginx configuration. Keep the saved prior config ready for rollback.

The template overwrites forwarding headers, enforces HTTPS/TLS 1.2+, preserves HSTS, caps request sizes/timeouts and adds perimeter rate limits. Profile paths and query strings are not written to nginx access logs. This privacy choice means uptime monitoring and aggregate counters must be provided separately.

Immediately check the HTTPS health revision, home page, source download, one operator-owned HKP/WKD or ASP profile and its ordinary proofs, and the explicit SimpleX request export. Do not initiate a SimpleX challenge against a live user without their opt-in. Verify the restricted proof endpoint rejects private addresses. Watch process restarts, 5xx responses, memory pressure and unexpected 429 responses during the beta.

## Rollback

If any post-switch check fails, restore the saved previous virtual-host config, run `nginx -t`, then reload nginx. This switches traffic back to the still-running old instance. Verify its original health/status and stop only the candidate Compose project afterward. Do not run global Docker prune or stop unrelated services.

The local automated rehearsal checks an observable upstream outage and recovery with a pinned image. It does not claim to have tested the live site's unknown predecessor. There is no application database migration. Never roll back local verifier nonce state or restore a stale challenge-state backup.

## Configuration references

The proxy boundary follows [Express's reverse-proxy guidance](https://expressjs.com/en/guide/behind-proxies/) and nginx's [proxy-header](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header) and [request-limiting](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html) documentation. Client identity is trusted only from explicitly configured immediate proxies, and those proxies overwrite the supplied headers.
