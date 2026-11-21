**Beta · Manual OpenPGP verification**

You can now add a reusable SimpleX contact address to your Keyoxide OpenPGP profile and ask someone to check it through a private chat. This guide covers the profile owner and the person doing the check.

The website displays the claim and lets you save a local verification request. Completing a check currently requires a terminal, GnuPG, Node.js and the SimpleX CLI. There is no hosted verification bot or public badge. Opening a profile never starts a SimpleX connection.

## 1. Add your address to your profile

In SimpleX, create or copy your **full reusable contact address**. Use the long address, not a short link, one-time invitation, group link or display name. See [SimpleX's connection guide](https://simplex.chat/docs/guide/making-connections.html) for the difference.

Decide whether the address should be public before adding it to a published key. Anyone who can read that key can read its address. For a private address, keep the updated public-key export private and use the local-file method below instead of publishing it.

You need an OpenPGP profile for this beta. ASP profiles can display links but cannot export a request for this OpenPGP check.

Use the primary fingerprint of your own key. In a terminal:

```sh
gpg --edit-key PRIMARY_FINGERPRINT
```

At the GnuPG prompt, run `list`, choose the intended user ID with `uid N`, then run `notation`. Enter the notation below, replacing `YOUR_FULL_SIMPLEX_ADDRESS` with the exact address you copied:

```text
proof@ariadne.id=YOUR_FULL_SIMPLEX_ADDRESS
```

Run `save`. Keep every character of the address unchanged, including its fragment and query parameters. For more detail, follow [Keyoxide's GnuPG claim instructions](https://docs.keyoxide.org/openpgp-profiles/gnupg/).

If the address is public, update the public key at the keyserver or Web Key Directory that serves your existing profile, then reopen that profile here. Keep your private signing key on your own machine. The site only needs the public key.

## 2. Save the verification request

Open the profile and expand **SimpleX link · Not checked**. Review the address, select the checkbox consenting to a local save, then choose **Save local verification request**.

This saves `simplex-verification-request.json`, containing the exact address, primary fingerprint and public key. No chat is opened and no verification result is uploaded. The profile stays **Not checked** after download, including after a successful local check.

If there is no save button, confirm that this is an OpenPGP profile with a full contact address. Invitation links, short links and ASP profiles do not support export. The SimpleX engine also rejects group links before connecting.

## 3. Run the check on the verifier's computer

The verifier is the person checking the profile. Agree with the profile owner before making contact and confirm the primary fingerprint through a channel you already trust.

Install Node.js 22.23.5 and GnuPG. Download the [source for this site's running release](/source.tar.gz), extract it and enter `experiments/simplex-verifier`. Install its locked dependencies:

```sh
npm ci --ignore-scripts
```

Install the SimpleX CLI version listed in [the verifier's pinned upstream file](https://github.com/monero-love/keyoxide-web/blob/work/simplex-address-verifier/experiments/simplex-verifier/upstream-lock.json), verifying the binary's published checksum. The commands below assume the CLI executable is available as `simplex-chat`. The [verifier README](https://github.com/monero-love/keyoxide-web/blob/work/simplex-address-verifier/experiments/simplex-verifier/README.md) has the supported version and operating details.

In that directory, create a fresh verifier profile and leave it running in one terminal:

```sh
umask 077
mkdir -p .local/verifier
simplex-chat -d .local/verifier/chat -p 5225 --user-display-name LocalVerifier
```

Keep the API bound to loopback, on a trusted single-user machine. Use a fresh profile for each recheck, rather than an existing chat. Copy the downloaded request into this directory, then run in a second terminal:

```sh
node cli.js --request simplex-verification-request.json ws://127.0.0.1:5225 1 .local/challenges
```

Here `1` is the numeric user ID for a fresh CLI database. The verifier checks the signed address claim before connecting. It sends a challenge binding the exact address, primary fingerprint, verifier identity, random nonce and five-minute expiry.

### Keeping the address private

The owner can export the updated public key locally:

```sh
gpg --armor --export PRIMARY_FINGERPRINT > public.asc
```

Share only that public export and the exact address privately with the verifier. Save the address as `address.txt` without a trailing newline. Instead of the downloaded-request command, the verifier runs:

```sh
node cli.js public.asc address.txt PRIMARY_FINGERPRINT ws://127.0.0.1:5225 1 .local/challenges
```

## 4. Sign and reply as the profile owner

Accept the verifier's contact request in SimpleX. Review every field of the received challenge. Save its JSON exactly, including the final newline, as `challenge.txt` on your signing machine. Sign that file locally:

```sh
gpg --local-user PRIMARY_FINGERPRINT --armor --detach-sign --output reply.asc challenge.txt
```

Paste the complete detached signature from `reply.asc` into **the same 1:1 chat** before the challenge expires. Do not send a private key or a clearsigned message. A valid signing subkey belonging to the claimed primary key is supported.

The verifier reports `checked` only after a valid response. A wrong key, changed address, expired challenge, replay or missing response cannot produce success. If a check times out, coordinate with the owner and start a fresh attempt.

## What the result means

A successful check means the verifier reached a contact through that address and received a fresh signature from the claimed key. A copied address alone proves nothing. This does not establish a legal identity, exclusive ownership or future reachability.

A public badge, if introduced later, would be the verifier's attestation, not independently verifiable proof of chat delivery. Its label would be “SimpleX address checked by monero.love on [date]”. This beta does not issue one.

Keep request files, local state and chat history private. Do not publish transcripts. Retain nonce tombstones until challenges expire, then remove unneeded test data following the verifier README. Signing keys stay local.

After rotating an address, update the signed claim and check the new address through a fresh connection. An existing chat may survive address deletion, so a reply in an old chat does not check the new address.
