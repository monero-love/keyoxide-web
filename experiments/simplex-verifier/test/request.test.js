// SPDX-License-Identifier: AGPL-3.0-or-later
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createRequest,parseRequest} from '../src/request.js'
import {claimedKey} from '../src/verifier.js'
import {fixture,address} from './helpers.js'

test('downloaded envelope is revalidated against the actual signed claim',async()=>{
 const f=fixture()
 try {
  const request=createRequest({uri:address,proofs:[`openpgp4fpr:${f.fingerprint}`]}, {fingerprint:f.fingerprint,encodedKey:f.publicKey})
  const options=parseRequest(JSON.parse(JSON.stringify(request)))
  await claimedKey(options.armoredKey,options.address,options.fingerprint)
  const changed=parseRequest({...request,address:address+'x'})
  await assert.rejects(claimedKey(changed.armoredKey,changed.address,changed.fingerprint),/exact address/)
 } finally {f.cleanup()}
})
test('request rejects unsupported version, private key, invitation and mismatched profile',()=>{
 const key={fingerprint:'a'.repeat(40),encodedKey:'-----BEGIN PGP PUBLIC KEY BLOCK-----\nfixture'}
 const claim={uri:address,proofs:[`openpgp4fpr:${key.fingerprint}`]}
 const request=createRequest(claim,key)
 for(const change of [{version:2},{armoredKey:'-----BEGIN PGP PRIVATE KEY BLOCK-----'},{address:'simplex:/invitation#/?v=2'},{fingerprint:'not-a-key'},{address:address+'\n'}])assert.throws(()=>parseRequest({...request,...change}))
 assert.throws(()=>createRequest({...claim,proofs:['openpgp4fpr:'+'b'.repeat(40)]},key))
})
