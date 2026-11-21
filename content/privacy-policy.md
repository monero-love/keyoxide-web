This page describes the keyoxide.net instance and its Tor onion service.

## Profiles and identity proofs

Keyoxide fetches the OpenPGP key or ASP profile requested in the URL. Your browser verifies identity claims using the published proofs. When a browser cannot fetch a proof directly, this instance can fetch it through its verification proxy. Those requests can reach external services associated with the profile.

OpenPGP keys may be cached briefly to reduce repeated requests to keyservers. No account is needed to use this instance.

## Aggregate analytics on keyoxide.net

The HTTPS site uses self-hosted Plausible analytics through endpoints on keyoxide.net. The browser does not contact the private analytics server directly. The tracking code does not set cookies, and it respects Do Not Track, Global Privacy Control and the Plausible opt-out flag.

Analytics receives a page category rather than a profile identifier. Profile URLs are reduced to `/profile`, and query strings and fragments are excluded from pageview URLs. Referrers supplied by your browser are used to report how visitors find the site. The request's IP address and browser user agent are passed to Plausible for processing.

The Tor onion service does not load the analytics scripts.

## Operational logs

Normal web access logging is disabled. Application, service and error logs are retained for operation and troubleshooting. Keyoxide runs in production mode, which removes profile identifiers, request paths and client IPs from its normal structured application logs.

## Other instances

Other Keyoxide instances have their own infrastructure and policies. This page applies only to keyoxide.net and its onion service.
