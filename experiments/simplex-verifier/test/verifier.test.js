// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as pgp from 'openpgp'
import validUrl from 'valid-url'
import { Verifier, Store, claimedKey, checkAddress } from '../src/verifier.js'
import { fixture, sign, MockTransport, address } from './helpers.js'
let alice, wrong, dir
before(() => { alice=fixture(); wrong=fixture(); dir=mkdtempSync(join(tmpdir(),'simplex-state-')) })
after(() => { alice?.cleanup(); wrong?.cleanup(); rmSync(dir,{recursive:true,force:true}) })
function setup() {
 const transport=new MockTransport()
 let offset=0
 const verifier=new Verifier({transport,store:new Store(dir),identity:'monero.love/local-poc',clock:()=>Date.now()+offset})
 return { verifier,transport,advance:s=>{offset+=s*1000}, options:{armoredKey:alice.publicKey,address,fingerprint:alice.fingerprint} }
}
async function reply(s, text) { return {channel:s.transport.channel,signature:await sign(text,alice)} }
test('valid UID notation and valid signing subkey succeed',async()=>{
 const s=setup(), p=await s.verifier.start(s.options), r=await reply(s,p.text)
 const signature=await pgp.readSignature({armoredSignature:r.signature})
 const key=await pgp.readKey({armoredKey:alice.publicKey})
 assert.notEqual(signature.packets[0].issuerKeyID.toHex(),key.getKeyID().toHex())
 assert.equal((await s.verifier.finish(p.id,r)).result,'checked')
})
test('wrong signing key rejected',async()=>{const s=setup(),p=await s.verifier.start(s.options);await assert.rejects(s.verifier.finish(p.id,{channel:s.transport.channel,signature:await sign(p.text,wrong)}))})
test('wrong primary fingerprint rejected before contacting',async()=>{const s=setup();await assert.rejects(s.verifier.start({...s.options,fingerprint:wrong.fingerprint}));assert.equal(s.transport.sent.length,0)})
test('changed address rejected before contacting',async()=>{const s=setup();await assert.rejects(s.verifier.start({...s.options,address:address+'x'}),/exact address/);assert.equal(s.transport.sent.length,0)})
test('signature over changed address rejected',async()=>{const s=setup(),p=await s.verifier.start(s.options);await assert.rejects(s.verifier.finish(p.id,await reply(s,p.text.replace(address,address+'x'))))})
test('expiry enforced',async()=>{const s=setup(),p=await s.verifier.start(s.options),r=await reply(s,p.text);s.advance(300);await assert.rejects(s.verifier.finish(p.id,r),/expired/)})
test('one-time use survives a new verifier instance',async()=>{const s=setup(),p=await s.verifier.start(s.options),r=await reply(s,p.text);await s.verifier.finish(p.id,r);const v=new Verifier({transport:s.transport,store:new Store(dir),identity:'monero.love/local-poc'});await assert.rejects(v.finish(p.id,r),/EEXIST/)})
test('concurrent replay only succeeds once',async()=>{const s=setup(),p=await s.verifier.start(s.options),r=await reply(s,p.text);const results=await Promise.allSettled([s.verifier.finish(p.id,r),s.verifier.finish(p.id,r)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1)})
test('no response is not verification',async()=>{const s=setup();await assert.rejects(s.verifier.run(s.options),/no response/)})
test('other chat, group, or other local user rejected',async()=>{for(const change of [{contactId:99},{kind:'group'},{userId:2},{connectionId:999}]){const s=setup(),p=await s.verifier.start(s.options),r=await reply(s,p.text);r.channel={...r.channel,...change};await assert.rejects(s.verifier.finish(p.id,r),/1:1 chat/)}})
test('copied address is not a signature',async()=>{const s=setup(),p=await s.verifier.start(s.options);await assert.rejects(s.verifier.finish(p.id,{channel:s.transport.channel,signature:address}))})
test('verifier identity and nonce are signature-bound',async()=>{for(const field of ['verifier','nonce']){const s=setup(),p=await s.verifier.start(s.options);const c=JSON.parse(p.text);c[field]='attacker';await assert.rejects(s.verifier.finish(p.id,await reply(s,JSON.stringify(c,null,2)+'\n')))}})
test('invitation links, names, whitespace rejected',()=>{for(const a of ['https://simplex.chat/invitation#/?v=2','Alice',address+'\n','simplex:/invitation#/?v=2']) assert.throws(()=>checkAddress(a))})
test('tampered self-certification does not establish a claim',async()=>{const key=await pgp.readKey({armoredKey:alice.publicKey});key.users[0].selfCertifications[0].rawNotations.find(n=>n.name==='proof@ariadne.id').value=new TextEncoder().encode(address+'x');await assert.rejects(claimedKey(key.armor(),address+'x',alice.fingerprint))})
test('doipjs URI dependency preserves HTTPS and simplex full link bytes',()=>{for(const a of [address,address.replace('https://simplex.chat/','simplex:/')])assert.equal(validUrl.isUri(a),a)})
test('revoked primary key rejected before connecting',async()=>{
 const revoked=await pgp.revokeKey({key:await pgp.readPrivateKey({armoredKey:alice.privateKey})})
 const s=setup();await assert.rejects(s.verifier.start({...s.options,armoredKey:revoked.publicKey}));assert.equal(s.transport.sent.length,0)
})
test('expired profile key rejected before connecting',async()=>{const s=setup();s.advance(86401);await assert.rejects(s.verifier.start(s.options));assert.equal(s.transport.sent.length,0)})
test('broken subkey binding cannot validate a response',async()=>{
 const s=setup(), key=await pgp.readKey({armoredKey:alice.publicKey})
 key.subkeys[0].bindingSignatures=[]
 const p=await s.verifier.start({...s.options,armoredKey:key.armor()})
 await assert.rejects(s.verifier.finish(p.id,await reply(s,p.text)))
})
test('failed send invalidates its challenge',async()=>{
 const s=setup();let id
 const create=s.verifier.store.create.bind(s.verifier.store)
 s.verifier.store.create=record=>{id=record.id;create(record)}
 s.transport.send=async()=>{throw Error('send failed')}
 await assert.rejects(s.verifier.start(s.options),/send failed/)
 assert.throws(()=>s.verifier.store.consume(id),/EEXIST/)
})
test('receive transport failure invalidates its challenge',async()=>{
 const s=setup();let id
 const create=s.verifier.store.create.bind(s.verifier.store)
 s.verifier.store.create=record=>{id=record.id;create(record)}
 s.transport.receive=async()=>{throw Error('transport closed')}
 await assert.rejects(s.verifier.run(s.options),/transport closed/)
 assert.throws(()=>s.verifier.store.consume(id),/EEXIST/)
})
test('manual GnuPG detached signature interoperates',async()=>{const s=setup(),p=await s.verifier.start(s.options);assert.equal((await s.verifier.finish(p.id,{channel:s.transport.channel,signature:alice.signWithGpg(p.text)})).result,'checked')})
