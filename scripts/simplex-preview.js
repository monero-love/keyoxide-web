// SPDX-License-Identifier: AGPL-3.0-or-later
// Local-only visual preview using a disposable signed key and a non-routable link.
import express from 'express'
import { readKey } from 'openpgp'
import { openpgp } from 'doipjs'
import { fixture } from '../experiments/simplex-verifier/test/helpers.js'
import { matchClaim } from '../src/server/claimVerification.js'
import { isSimplexClaim } from '../src/shared/simplex.js'
let key = fixture()
let profile
try {
  profile = await openpgp.parsePublicKey(await readKey({armoredKey:key.publicKey}))
} finally { key.cleanup(); key = undefined }
for (const persona of profile.personas) {
  persona.claims = persona.claims.map(matchClaim)
  persona.description = 'Local preview with a synthetic, non-routable address. No SimpleX connection is made.'
  persona.avatarUrl = '/static/favicon.svg'
}
const app = express()
app.set('view engine', 'pug')
app.use('/static', express.static('static'))
app.get('/', (_req,res) => res.render('profile', {
  title:'Local SimpleX verifier preview', data:profile.toJSON(), isSimplexClaim,
  meta:{keyoxide:{sourceUrl:'https://github.com/monero-love/keyoxide-web',semver:'local-simplex-preview'}}
}))
app.listen(Number(process.env.PREVIEW_PORT || 3325),'127.0.0.1',()=>console.log('Local preview ready'))
