// SPDX-License-Identifier: AGPL-3.0-or-later
// SimpleX links require an explicit local challenge, never a generic web proof.
// Detection is deliberately broader than the full-address format we export.
export function isSimplexClaim (uri) {
  return typeof uri === 'string' && (
    /^simplex:/i.test(uri) ||
    /^https?:\/\/simplex\.chat(?:[/:?#]|$)/i.test(uri)
  )
}

export function uncheckedSimplexClaim (claim) {
  return {
    claimVersion: 2,
    uri: claim.uri,
    proofs: [claim.fingerprint],
    matches: [],
    // Existing doipjs NO_MATCHES status, not a new public-proof success status.
    status: 301
  }
}
