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
