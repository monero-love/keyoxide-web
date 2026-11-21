// SPDX-License-Identifier: AGPL-3.0-or-later
import {test} from 'node:test'
import assert from 'node:assert/strict'
import esmock from 'esmock'
import {fixture,address} from '../experiments/simplex-verifier/test/helpers.js'
import * as pgp from 'openpgp'

test('public key retrieval accepts valid signed claims and strips tampered certifications',async()=>{
 const f=fixture()
 try {
  let body=Buffer.from(f.publicKey)
  const module=await esmock('../src/server/openpgpProfiles.js',{'../src/server/publicFetch.js':{fetchPublicBytes:async()=>body}})
  const good=await module.fetchHKP(f.fingerprint)
  assert.equal(good.personas[0].claims[0].uri,address)
  const key=await pgp.readKey({armoredKey:f.publicKey})
  key.users[0].selfCertifications[0].rawNotations.find(n=>n.name==='proof@ariadne.id').value=new TextEncoder().encode(address+'forged')
  body=Buffer.from(key.armor())
  const tampered = await module.fetchHKP(f.fingerprint)
  assert.equal(tampered.personas[0].claims.some(claim=>claim.uri===address+'forged'),false)
 }finally{f.cleanup()}
})

test('WKD fallback and source URL use the bounded public fetcher',async()=>{
 const f=fixture(),urls=[]
 try {
  const module=await esmock('../src/server/openpgpProfiles.js',{'../src/server/publicFetch.js':{fetchPublicBytes:async url=>{urls.push(url);if(urls.length===1)throw Error('no advanced WKD');return Buffer.from(f.publicKey)}}})
  const profile=await module.fetchWKD('test@example.invalid')
  assert.equal(urls.length,2)
  assert.ok(urls[0].startsWith('https://openpgpkey.example.invalid/'))
  assert.ok(urls[1].startsWith('https://example.invalid/'))
  assert.equal(profile.publicKey.fetch.resolvedUrl,urls[1])
  await assert.rejects(module.fetchWKD('test@127.0.0.1/evil'))
  await assert.rejects(module.fetchHKP(f.fingerprint,'user@host'))
  await assert.rejects(module.fetchSignature('untrusted'))
 }finally{f.cleanup()}
})

test('ASP signed profile verifies through bounded retrieval and preserves fetch metadata',async()=>{
 const {generateKeyPair,exportJWK,CompactSign}=await import('jose')
 const {asp}=await import('doipjs')
 const {publicKey,privateKey}=await generateKeyPair('ES256')
 const jwk=await exportJWK(publicKey)
 const fingerprint=await asp.computeJwkFingerprint(jwk)
 const id='aspe:example.com:'+fingerprint
 const payload={'http://ariadne.id/type':'profile','http://ariadne.id/version':0,'http://ariadne.id/name':'Disposable ASP fixture','http://ariadne.id/claims':['dns:example.com']}
 const signed=await new CompactSign(Buffer.from(JSON.stringify(payload))).setProtectedHeader({alg:'ES256',kid:fingerprint,jwk}).sign(privateKey)
 const module=await esmock('../src/server/index.js',{'../src/server/publicFetch.js':{fetchPublicBytes:async()=>Buffer.from(signed)}})
 const profile=await module.generateAspeProfile(id)
 assert.equal(profile.publicKey.fingerprint,fingerprint)
 assert.equal(profile.publicKey.fetch.method,'aspe')
 assert.equal(profile.publicKey.fetch.query,id)
 assert.equal(profile.publicKey.fetch.resolvedUrl,'https://example.com/.well-known/aspe/id/'+fingerprint)
 assert.equal(profile.personas[0].claims[0].uri,'dns:example.com')
})
