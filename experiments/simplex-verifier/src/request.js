// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared browser/CLI envelope. It is input, never proof or an attestation.
export function parseRequest(value) {
  if (!value || value.format !== 'monero.love/simplex-verifier-request' || value.version !== 1)
    throw Error('Unsupported verifier request')
  const {address, fingerprint, armoredKey} = value
  if (typeof address !== 'string' || address.length > 16000 ||
      !/^(https:\/\/simplex\.chat\/contact#|simplex:\/contact#)/.test(address) ||
      /[\s\x00-\x1f\x7f]/.test(address)) throw Error('A full SimpleX contact address is required')
  if (typeof fingerprint !== 'string' || !/^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/.test(fingerprint))
    throw Error('An OpenPGP primary fingerprint is required')
  if (typeof armoredKey !== 'string' || armoredKey.length > 1024 * 1024 ||
      !armoredKey.startsWith('-----BEGIN PGP PUBLIC KEY BLOCK-----') ||
      armoredKey.includes('PRIVATE KEY')) throw Error('An exported OpenPGP public key is required')
  return {address, fingerprint, armoredKey}
}

export function createRequest(claim, publicKey) {
  if (!publicKey || claim.proofs?.[0]?.toLowerCase() !== `openpgp4fpr:${publicKey.fingerprint?.toLowerCase()}`)
    throw Error('This claim needs the matching OpenPGP profile')
  const value = {format:'monero.love/simplex-verifier-request',version:1,
    address:claim.uri,fingerprint:publicKey.fingerprint,armoredKey:publicKey.encodedKey}
  parseRequest(value)
  return value
}
