// SPDX-License-Identifier: AGPL-3.0-or-later
import * as pgp from 'openpgp'
import { randomBytes, createHash } from 'node:crypto'
export { Store } from './state.js'

const encoder = new TextEncoder()
export function checkAddress(address) {
  // Restrict this POC to full links. The SimpleX engine, not a home-grown URL
  // normalizer, decides whether this is a reusable contact address.
  if (typeof address !== 'string' || address.length > 16000 ||
      !/^(https:\/\/simplex\.chat\/contact#|simplex:\/contact#)/.test(address) ||
      /[\s\x00-\x1f\x7f]/.test(address)) throw Error('unsupported full address')
  return address
}

export async function claimedKey(armoredKey, address, fingerprint, now = new Date()) {
  checkAddress(address)
  if (typeof armoredKey !== 'string' || Buffer.byteLength(armoredKey) > 1024*1024) throw Error('invalid public key size')
  if (!/^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/.test(fingerprint)) throw Error('invalid primary fingerprint')
  const key = await pgp.readKey({ armoredKey })
  if (key.isPrivate()) throw Error('supply public key only')
  if (key.getFingerprint() !== fingerprint.toLowerCase()) throw Error('wrong primary key')
  await key.verifyPrimaryKey(now)
  // Use each UID's newest self-certification, like doipjs, but explicitly verify
  // that exact certification. Do not fall back to an older claim after rotation.
  for (const user of key.users) {
    if (!user.userID) continue
    const cert = [...user.selfCertifications].sort((a,b) => b.created - a.created)[0]
    if (!cert) continue
    try {
      if (await user.isRevoked(cert, undefined, now)) continue
      await cert.verify(key.keyPacket, pgp.enums.signature.certGeneric,
        { key: key.keyPacket, userID: user.userID }, now)
    } catch { continue }
    if (cert.rawNotations.some(n => n.humanReadable &&
        ['proof@ariadne.id', 'proof@metacode.biz'].includes(n.name) &&
        Buffer.from(n.value).equals(Buffer.from(encoder.encode(address))))) return key
  }
  throw Error('exact address missing from valid signed profile')
}

export class Verifier {
  constructor({ transport, store, identity, clock = () => Date.now() }) {
    if (!identity || identity.length > 256 || /[\r\n]/.test(identity)) throw Error('invalid verifier identity')
    Object.assign(this, { transport, store, identity, clock })
  }
  async start({ armoredKey, address, fingerprint, ttl = 300 }) {
    if (!Number.isInteger(ttl) || ttl < 1 || ttl > 600) throw Error('invalid TTL')
    const key = await claimedKey(armoredKey, address, fingerprint, new Date(this.clock()))
    const channel = await this.transport.connectAddress(address)
    if (channel.kind !== 'direct' || channel.address !== address) throw Error('address/channel mismatch')
    const issued = Math.floor(this.clock() / 1000)
    const id = randomBytes(32).toString('hex')
    const challenge = {
      protocol: 'monero.love/simplex-openpgp-challenge', version: 1,
      purpose: 'Sign only to confirm this SimpleX address to this verifier',
      address, primaryFingerprint: key.getFingerprint(), verifier: this.identity,
      nonce: id, issuedAt: issued, expiresAt: issued + ttl
    }
    const text = JSON.stringify(challenge, null, 2) + '\n'
    this.store.create({ id, challenge, text, channel, armoredKey })
    try { await this.transport.send(channel, text) }
    catch (error) { this.store.consume(id); throw error }
    return { id, text, expiresAt: challenge.expiresAt }
  }
  async finish(id, response) {
    const record = this.store.read(id)
    const { challenge, channel } = record
    if (record.id !== id || challenge.nonce !== id || challenge.version !== 1 ||
        challenge.protocol !== 'monero.love/simplex-openpgp-challenge' ||
        record.text !== JSON.stringify(challenge,null,2)+'\n' ||
        !Number.isSafeInteger(challenge.issuedAt) || !Number.isSafeInteger(challenge.expiresAt) ||
        challenge.expiresAt <= challenge.issuedAt || challenge.expiresAt-challenge.issuedAt > 600 ||
        ![channel.userId,channel.contactId,channel.connectionId].every(n=>Number.isSafeInteger(n)&&n>0)) {
      this.store.consume(id)
      throw Error('invalid challenge state')
    }
    if (response.channel?.kind !== 'direct' || response.channel?.userId !== channel.userId ||
        response.channel?.contactId !== channel.contactId || response.channel?.connectionId !== channel.connectionId)
      throw Error('reply is not from the connected 1:1 chat')
    this.store.consume(id)
    const now = Math.floor(this.clock() / 1000)
    if (now < challenge.issuedAt || now >= challenge.expiresAt) throw Error('challenge expired')
    if (challenge.verifier !== this.identity || challenge.address !== channel.address) throw Error('binding mismatch')
    if (typeof response.signature !== 'string' || response.signature.length > 32000) throw Error('invalid response')
    const key = await claimedKey(record.armoredKey, challenge.address, challenge.primaryFingerprint, new Date(this.clock()))
    const signature = await pgp.readSignature({ armoredSignature: response.signature })
    if (signature.packets.length !== 1) throw Error('expected one detached signature')
    const packet = signature.packets[0]
    const signedAt = Math.floor(packet.created.getTime()/1000)
    if (signedAt < challenge.issuedAt || signedAt > now || signedAt >= challenge.expiresAt) throw Error('signature time outside challenge')
    // Resolves valid signing subkeys and checks binding, expiry, revocation and
    // signing capability at verification time as well as signature creation time.
    await key.getSigningKey(packet.issuerKeyID, new Date(this.clock()))
    const result = await pgp.verify({ message: await pgp.createMessage({ binary: encoder.encode(record.text) }),
      signature, verificationKeys: key, date: new Date(this.clock()) })
    if (result.signatures.length !== 1) throw Error('expected one signature')
    await result.signatures[0].verified
    if (Math.floor(this.clock()/1000) >= challenge.expiresAt) throw Error('challenge expired during verification')
    return { result: 'checked', checkedAt: new Date(this.clock()).toISOString(),
      primaryFingerprint: key.getFingerprint(), verifier: this.identity,
      addressSha256: createHash('sha256').update(challenge.address,'utf8').digest('hex'),
      statement: 'Reached a contact through the claimed address and received a fresh signature from the claimed key.' }
  }
  async run(options) {
    const pending = await this.start(options)
    const record = this.store.read(pending.id)
    let response
    try { response = await this.transport.receive(record.channel, Math.max(1, pending.expiresAt * 1000 - this.clock())) }
    catch (error) { this.store.consume(pending.id); throw error }
    if (!response) { this.store.consume(pending.id); throw Error('no response') }
    return this.finish(pending.id, response)
  }
}
