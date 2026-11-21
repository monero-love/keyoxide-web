// SPDX-License-Identifier: AGPL-3.0-or-later
// Local-only preview. All signing keys are disposable and removed before listen.
import express from 'express'
import { readKey } from 'openpgp'
import { openpgp } from 'doipjs'
import { stringReplace } from 'string-replace-middleware'
import { fixture } from '../experiments/simplex-verifier/test/helpers.js'
import { matchClaim } from '../src/server/claimVerification.js'
import { isSimplexClaim } from '../src/shared/simplex.js'
const profiles = {}
for (const [name,claim] of [['simplex',undefined],['github','https://gist.github.com/disposable-fixture/fixture-proof'],['dns','dns:fixture.example']]) {
  let key = fixture(claim)
  try { profiles[name] = await openpgp.parsePublicKey(await readKey({armoredKey:key.publicKey})) }
  finally { key.cleanup(); key = undefined }
  for (const persona of profiles[name].personas) {
    persona.claims = persona.claims.map(matchClaim)
    persona.description = 'Local preview with disposable fixtures. No live users are contacted.'
    persona.avatarUrl = '/static/favicon.svg'
  }
}
const app = express()
const port = Number(process.env.PREVIEW_PORT || 3325)
app.set('view engine', 'pug')
app.use(stringReplace({PLACEHOLDER__PROXY_HOSTNAME:`127.0.0.1:${port}`,PLACEHOLDER__PROXY_SCHEME:'http'},{contentTypeFilterRegexp:/application\/javascript/}))
app.use('/static', express.static('static'))
for (const [path,name] of [['/','simplex'],['/github','github'],['/dns','dns']]) {
  app.get(path, (_req,res) => res.render('profile', {
    title:'Local verification preview', data:profiles[name].toJSON(), isSimplexClaim,
    meta:{keyoxide:{sourceUrl:'https://github.com/monero-love/keyoxide-web',semver:'local-simplex-preview'}}
  }))
}
app.listen(port,'127.0.0.1',()=>console.log('Local preview ready'))
