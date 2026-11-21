// SPDX-License-Identifier: AGPL-3.0-or-later
import { Claim } from 'doipjs'
import { isSimplexClaim, uncheckedSimplexClaim } from '../shared/simplex.js'

export function matchClaim (claim) {
  if (isSimplexClaim(claim.uri)) return Claim.fromJSON(uncheckedSimplexClaim(claim))
  claim.match()
  return claim
}

export async function verifyProfileClaims (profile, options) {
  if (!profile.personas) return profile
  await Promise.all(profile.personas.map(async persona => {
    persona.claims = await Promise.all(persona.claims.map(async claim => {
      // Reset even cached/imported successes. No network call for SimpleX.
      if (isSimplexClaim(claim.uri)) return Claim.fromJSON(uncheckedSimplexClaim(claim))
      await claim.verify(options)
      return claim
    }))
  }))
  return profile
}
