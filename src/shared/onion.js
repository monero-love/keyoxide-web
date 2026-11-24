// SPDX-License-Identifier: AGPL-3.0-or-later
// Reserve all onion URLs from automatic generic provider verification.
export function isOnionClaim (uri) {
  if (typeof uri !== 'string') return false
  try { return new URL(uri).hostname.toLowerCase().replace(/\.$/, '').endsWith('.onion') } catch {
    return /\.onion(?:[/:?#]|$)/i.test(uri)
  }
}

export function parseOnionClaim (uri) {
  if (typeof uri !== 'string') throw new Error('Invalid onion claim')
  const match = /^(https?):\/\/([a-z2-7]{56}\.onion)\/\.well-known\/keyoxide\.txt$/.exec(uri)
  if (!match) throw new Error('Use a full v3 onion URL ending in /.well-known/keyoxide.txt')
  return { url: uri, hostname: match[2], protocol: match[1] }
}

export function uncheckedOnionClaim (claim) {
  return { claimVersion: 2, uri: claim.uri, proofs: [claim.fingerprint], matches: [], status: 301 }
}

export function onionProofIdentifier (proof) {
  if (typeof proof !== 'string') throw new Error('Unsupported profile identifier')
  if (/^(?:openpgp4fpr:)?(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/.test(proof)) {
    return `openpgp4fpr:${proof.replace(/^openpgp4fpr:/, '').toLowerCase()}`
  }
  if (proof.length <= 512 && /^aspe:[a-zA-Z0-9.-]+:[a-zA-Z0-9]+$/.test(proof)) return proof
  throw new Error('Unsupported profile identifier')
}

export function matchesOnionProof (text, proof) {
  const identifier = onionProofIdentifier(proof)
  if (typeof text !== 'string' || text.length > 65536) return false
  return text.split(/\r?\n/).some(line => {
    const value = line.trim()
    return identifier.startsWith('openpgp4fpr:') ? value.toLowerCase() === identifier : value === identifier
  })
}
