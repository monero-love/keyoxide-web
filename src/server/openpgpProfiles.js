/*
Copyright (C) 2021 Yarmo Mackenbach

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License as published by the Free
Software Foundation, either version 3 of the License, or (at your option)
any later version.

This program is distributed in the hope that it will be useful, but WITHOUT
ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
details.

You should have received a copy of the GNU Affero General Public License along
with this program. If not, see <https://www.gnu.org/licenses/>.

Also add information on how to contact you by electronic and paper mail.

If your software can interact with users remotely through a computer network,
you should also make sure that it provides a way for users to get its source.
For example, if your program is a web application, its interface could display
a "Source" link that leads users to an archive of the code. There are many
ways you could offer source, and different solutions will be better for different
programs; see section 13 for the specific requirements.

You should also get your employer (if you work as a programmer) or school,
if any, to sign a "copyright disclaimer" for the program, if necessary. For
more information on this, and how to apply and follow the GNU AGPL, see <https://www.gnu.org/licenses/>.
*/
import * as doipjs from 'doipjs'
import { readKey, enums } from 'openpgp'
import { computeWKDLocalPart } from './utils.js'
import { fetchPublicBytes } from './publicFetch.js'

async function parseKey (bytes) {
  const text = bytes.toString('utf8')
  const key = await readKey(text.includes('-----BEGIN PGP PUBLIC KEY BLOCK-----')
    ? { armoredKey: text }
    : { binaryKey: new Uint8Array(bytes) })
  await key.verifyPrimaryKey()
  const profile = await doipjs.openpgp.parsePublicKey(key)
  // doipjs selects raw latest certifications. Verify those exact packets before
  // allowing their claims to participate in any public-proof verification.
  for (const persona of profile.personas) {
    const user = key.users.find(user => user.userID?.userID === persona.identifier)
    const cert = user && [...user.selfCertifications].sort((a, b) => b.created - a.created)[0]
    try {
      if (!cert || await user.isRevoked(cert)) throw new Error('Revoked or missing certification')
      await cert.verify(key.keyPacket, enums.signature.certGeneric, { key: key.keyPacket, userID: user.userID })
    } catch {
      persona.claims = []
    }
  }
  return profile
}

export async function fetchWKD (id) {
  const match = /^([^@\s]+)@([a-zA-Z0-9.-]+)$/.exec(id)
  if (!match) throw new Error('Invalid WKD identifier')
  const [, local, domain] = match
  const hash = await computeWKDLocalPart(local)
  const suffix = `hu/${hash}?l=${encodeURIComponent(local)}`
  const urls = [`https://openpgpkey.${domain}/.well-known/openpgpkey/${domain}/${suffix}`, `https://${domain}/.well-known/openpgpkey/${suffix}`]
  for (const url of urls) {
    try {
      const profile = await parseKey(await fetchPublicBytes(url))
      Object.assign(profile.publicKey.fetch, { method: 'wkd', query: id, resolvedUrl: url })
      return profile
    } catch { /* Try the documented direct WKD fallback, with the same guards. */ }
  }
  throw new Error('No public key could be fetched using WKD')
}

export async function fetchHKP (id, keyserverDomain = 'keys.openpgp.org') {
  if (!/^[a-zA-Z0-9.-]+$/.test(keyserverDomain)) throw new Error('Invalid keyserver hostname')
  const query = id.includes('@') ? id : `0x${id.replace(/\s/g, '')}`
  const url = `https://${keyserverDomain}/pks/lookup?${new URLSearchParams({ op: 'get', options: 'mr', search: query })}`
  const profile = await parseKey(await fetchPublicBytes(url))
  Object.assign(profile.publicKey.fetch, { method: 'hkp', query: id, resolvedUrl: url })
  return profile
}

export async function fetchKeybase (username, fingerprint) {
  if (!/^[a-zA-Z0-9_]+$/.test(username) || !/^[a-fA-F0-9]{40,64}$/.test(fingerprint)) throw new Error('Invalid Keybase identifier')
  const url = `https://keybase.io/${username}/pgp_keys.asc?fingerprint=${fingerprint}`
  const profile = await parseKey(await fetchPublicBytes(url))
  Object.assign(profile.publicKey.fetch, { method: 'http', query: username, resolvedUrl: url })
  return profile
}

export async function fetchSignature () {
  // Upstream signature profiles fetch key URLs from unverified message metadata.
  // The release supports signed-key profiles and the local detached challenge.
  throw new Error('Legacy signature profiles are disabled in this release')
}
