// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict'
import * as doip from '../upstream/doipjs/src/index.js'
import { createRequire } from 'node:module'
const upstreamPgp = createRequire(new URL('../upstream/doipjs/package.json', import.meta.url))('openpgp')
import {fixture,address} from '../test/helpers.js'
for(const link of [address,address.replace('https://simplex.chat/','simplex:/')]) {
 const f=fixture(link)
 try {
  const profile=await doip.openpgp.parsePublicKey(await upstreamPgp.readKey({armoredKey:f.publicKey}))
  const claim=profile.personas[0].claims[0]
  assert.equal(claim.uri,link)
  claim.match()
  assert.equal(doip.Claim.fromJSON(JSON.parse(JSON.stringify(claim))).uri,link)
  console.log('PASS: signed notation → upstream parsePublicKey → match → JSON round trip, exact '+(link.startsWith('https:')?'HTTPS':'simplex:')+' bytes retained, status '+claim.status)
 } finally {f.cleanup()}
}
