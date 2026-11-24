**Beta · OpenPGP and ASP profiles**

An onion website proof links a Keyoxide profile to content published on a Tor onion service. The signed profile claims a specific proof URL, and that URL serves a text file containing the profile's identity identifier.

## 1. Publish the proof file

On your onion website, serve a plain UTF-8 text file at:

```text
http://YOUR_V3_ONION_ADDRESS.onion/.well-known/keyoxide.txt
```

Replace the placeholder with your full 56-character v3 onion hostname. The file must return HTTP 200 with `Content-Type: text/plain`, optionally with `charset=utf-8`. Keep it under 64 KiB. Redirects, HTML pages, compressed responses, custom ports, query strings and URL fragments are not supported. HTTPS works if the onion site has a valid TLS certificate.

For an OpenPGP profile, put this on a complete line, replacing the placeholder with the full primary-key fingerprint without spaces:

```text
openpgp4fpr:PRIMARY_KEY_FINGERPRINT
```

For an ASP profile, put its direct identity proof on a complete line:

```text
aspe:YOUR_PROFILE_DOMAIN:YOUR_PROFILE_ID
```

Use the exact ASP identifier shown by your profile tool. You can publish multiple identities on separate lines. This beta accepts direct identity proofs, not hashed proofs or links to a Keyoxide profile page.

## 2. Add the claim to your signed profile

For OpenPGP, add a `proof@ariadne.id` notation to the intended user ID's self-certification. Its value is the exact proof URL:

```text
proof@ariadne.id=http://YOUR_V3_ONION_ADDRESS.onion/.well-known/keyoxide.txt
```

Follow [Keyoxide's GnuPG instructions](https://docs.keyoxide.org/openpgp-profiles/gnupg/) and publish the updated public key through your existing keyserver or Web Key Directory. Keep your signing key private.

For ASP, add that same full proof URL as a claim using your profile editor, then sign and publish the updated profile. Do not add the `proof@ariadne.id=` prefix to an ASP claim.

The scheme and path are part of the claim. Use the exact published URL. Only v3 onion addresses with a valid checksum are accepted.

## 3. Check the claim

Open your profile on this instance and expand **Onion website · Not checked**. The panel shows the exact proof line expected for that profile.

Select the consent checkbox, then choose **Check onion proof through Tor**. The browser sends the onion URL to this instance. The instance retrieves the file through its local Tor connection, and your browser compares the file with the profile's identity identifier.

The result is **Proof matched via Tor** only when a complete line matches. A missing or different identifier reports a mismatch. An unreachable site, timeout, rate limit or disabled Tor transport leaves the claim unverified. You can retry later. Simply loading or refreshing the profile never contacts the onion website.

## What this proves

The signed profile claims the onion proof URL, and the onion website publishes a matching reference to that profile. This demonstrates a reciprocal link at the time of the check. It does not establish a legal identity, exclusive control or permanent ownership.

Your browser relies on this instance to retrieve the file faithfully. You can inspect the proof yourself in Tor Browser. Tor authenticates the onion destination and encrypts the connection even when the URL uses HTTP. See [Tor's explanation](https://community.torproject.org/onion-services/advanced/https/).

## Privacy and changes

Publishing the onion URL in a public profile makes it public and links that service to the profile. Do not use this workflow for an address you need to keep secret. Client-authorized private onion services are not supported.

The instance sees the requested onion URL. It does not receive your fingerprint as part of the check request, forward your cookies to the onion site, or fall back to clearnet. Proof contents are not rendered as HTML. Responses are not cached, and this deployment does not log request bodies or proof contents.

If you rotate an onion address, update the signed profile and publish the proof on the new service. Check again through the new URL. Removing a claim or file cannot erase older copies or previous observations.

This feature is a downstream addition on this instance. Other Keyoxide clients may display the claim without supporting its Tor check.
