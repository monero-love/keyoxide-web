// SPDX-License-Identifier: AGPL-3.0-or-later
import {test} from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import express from 'express'
import {Claim} from 'doipjs'
import {parseOnionClaim,isOnionClaim,matchesOnionProof} from '../src/shared/onion.js'
import {validateOnionClaim,fetchOnionProof} from '../src/server/onionFetch.js'
import {onionRouter} from '../src/server/onionRouter.js'
import {matchClaim,verifyProfileClaims} from '../src/server/claimVerification.js'
const host='pg6mmjiyjmcrsslvykfwnntlaru7p5svn6y2ymmju6nubxndf4pscryd.onion'
const url='http://'+host+'/.well-known/keyoxide.txt'
const fp='0123456789abcdef0123456789abcdef01234567'
async function proxy(t,response){
 const sockets=new Set();const targets=[];const requests=[]
 const server=net.createServer(socket=>{
  sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));let stage=0;let data=Buffer.alloc(0)
  socket.on('data',chunk=>{
   data=Buffer.concat([data,chunk])
   if(stage===0&&data.length>=2+data[1]){data=data.subarray(2+data[1]);socket.write(Buffer.from([5,0]));stage=1}
   if(stage===1&&data.length>=5&&data.length>=7+data[4]){
    assert.equal(data[3],3,'SOCKS uses domain names, never local DNS')
    targets.push({host:data.subarray(5,5+data[4]).toString(),port:data.readUInt16BE(5+data[4])})
    data=data.subarray(7+data[4]);socket.write(Buffer.from([5,0,0,1,127,0,0,1,0,80]));stage=2
   }
   if(stage===2&&data.includes('\r\n\r\n')){stage=3;requests.push(data.toString());if(response!==null)socket.end(response)}
  })
 })
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{for(const s of sockets)s.destroy();server.close()})
 return {port:server.address().port,targets,requests}
}
function answer(body,headers='Content-Type: text/plain; charset=utf-8',status=200){return `HTTP/1.1 ${status} Test\r\n${headers}\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`}
test('onion v3 checksum/version and exact claim format',()=>{
 assert.equal(validateOnionClaim(url).hostname,host)
 for(const bad of [url.replace(host,'a'.repeat(56)+'.onion'),url.replace('/.well-known/keyoxide.txt','/'),url+'?x=1',url+'#x',url.replace('http://','http://user@'),url.replace('.onion/','.onion:80/'),url.replace(host,'localhost'),url.replace(host,host.toUpperCase()),url.replace('http://','file://')])assert.throws(()=>validateOnionClaim(bad))
 assert.equal(parseOnionClaim(url).url,url)
 assert(isOnionClaim(url));assert(isOnionClaim('http://invalid.onion/'));assert(!isOnionClaim('https://example.org'))
})
test('complete proof lines match OpenPGP and ASP without substrings or HTML',()=>{
 assert(matchesOnionProof('openpgp4fpr:'+fp+'\n',fp));assert(matchesOnionProof('OPENPGP4FPR:'+fp.toUpperCase(),fp))
 for(const text of ['prefixopenpgp4fpr:'+fp,'openpgp4fpr:'+fp+'0','<b>openpgp4fpr:'+fp+'</b>','openpgp4fpr:'+'f'.repeat(40)])assert(!matchesOnionProof(text,fp))
 assert(matchesOnionProof('aspe:example.org:ABC123\n','aspe:example.org:ABC123'))
 assert(!matchesOnionProof('aspe:example.org:abc123','aspe:example.org:ABC123'))
})
test('cached onion success resets and profile verification makes no request',async()=>{
 const claim=Claim.fromJSON({claimVersion:2,uri:url,proofs:[fp],matches:[],status:200})
 assert.equal(matchClaim(claim).status,301)
 claim.verify=()=>{throw Error('must not fetch')}
 const profile={personas:[{claims:[claim]}]};await verifyProfileClaims(profile,{})
 assert.equal(profile.personas[0].claims[0].status,301)
})
test('SOCKS transport delegates exact onion host, bounds request and fetches matching proof',async t=>{
 const p=await proxy(t,answer('openpgp4fpr:'+fp+'\n'))
 const body=await fetchOnionProof(url,{port:p.port});assert(matchesOnionProof(body,fp))
 assert.deepEqual(p.targets,[{host,port:80}]);assert.match(p.requests[0],/^GET \/\.well-known\/keyoxide\.txt HTTP\/1.1/)
 assert.doesNotMatch(p.requests[0],/Cookie:|Authorization:|Referer:|X-Forwarded/i)
})
test('redirects are rejected without following onion or clearnet destinations',async t=>{
 const p=await proxy(t,answer('', 'Content-Type: text/plain\r\nLocation: http://127.0.0.1/',302))
 await assert.rejects(fetchOnionProof(url,{port:p.port}));assert.equal(p.targets.length,1)
})
test('HTML and compressed responses are rejected',async t=>{
 for(const header of ['Content-Type: text/html','Content-Type: text/plain\r\nContent-Encoding: gzip']){
  const p=await proxy(t,answer('openpgp4fpr:'+fp,header));await assert.rejects(fetchOnionProof(url,{port:p.port}))
 }
})
test('oversized, truncated and invalid UTF-8 responses fail closed',async t=>{
 for(const response of [answer('x'.repeat(100)), 'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\n'+'x'.repeat(100), 'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 10\r\n\r\nx',Buffer.concat([Buffer.from('HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 1\r\n\r\n'),Buffer.from([255])])]){
  const p=await proxy(t,response);await assert.rejects(fetchOnionProof(url,{port:p.port,maxBytes:64,timeout:300}))
 }
})
test('unresponsive Tor request times out and fails closed',async t=>{
 const p=await proxy(t,null);const start=Date.now();await assert.rejects(fetchOnionProof(url,{port:p.port,timeout:100}));assert(Date.now()-start<1500)
})
async function api(t,options){const app=express();app.use('/onion-proof',onionRouter(options));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());return 'http://127.0.0.1:'+server.address().port+'/onion-proof/check'}
const post=body=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
test('API requires explicit JSON POST, validates address before transport and returns no-store',async t=>{
 let calls=0;const endpoint=await api(t,{enabled:true,fetchProof:async()=>{calls++;return 'openpgp4fpr:'+fp}})
 assert.equal((await fetch(endpoint)).status,405)
 assert.equal((await fetch(endpoint,post({url:'http://127.0.0.1/'}))).status,400);assert.equal(calls,0)
 const r=await fetch(endpoint,post({url}));assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json()).url,url);assert.equal(calls,1)
})
test('disabled API and unavailable Tor never report success',async t=>{
 const off=await api(t,{});assert.equal((await fetch(off,post({url}))).status,503)
 const unavailable=await api(t,{enabled:true,fetchProof:async()=>{throw Error('private detail')}})
 const r=await fetch(unavailable,post({url}));assert.equal(r.status,502);assert(!(await r.text()).includes('private detail'))
})
test('API bounds concurrent work and releases slots after failure',async t=>{
 const releases=[];const endpoint=await api(t,{enabled:true,fetchProof:()=>new Promise((_,reject)=>releases.push(reject))})
 const pending=Array.from({length:4},()=>fetch(endpoint,post({url})))
 for(let i=0;i<100&&releases.length<4;i++)await new Promise(r=>setTimeout(r,10))
 assert.equal(releases.length,4);assert.equal((await fetch(endpoint,post({url}))).status,503)
 for(const release of releases)release(Error('failed'))
 await Promise.all(pending)
 assert.equal((await fetch(endpoint)).status,405)
 assert.equal((await fetch(endpoint)).status,429)
})

test('signed ASP profile preserves onion claim and its direct proof identifier',async()=>{
 const {generateKeyPair,exportJWK,CompactSign}=await import('jose')
 const {asp}=await import('doipjs')
 const {publicKey,privateKey}=await generateKeyPair('ES256')
 const jwk=await exportJWK(publicKey);const fingerprint=await asp.computeJwkFingerprint(jwk)
 const id='aspe:example.com:'+fingerprint
 const payload={'http://ariadne.id/type':'profile','http://ariadne.id/version':0,'http://ariadne.id/name':'Disposable onion ASP fixture','http://ariadne.id/claims':[url]}
 const signed=await new CompactSign(Buffer.from(JSON.stringify(payload))).setProtectedHeader({alg:'ES256',kid:fingerprint,jwk}).sign(privateKey)
 const profile=await asp.parseProfileJws(signed,id)
 const claim=matchClaim(profile.personas[0].claims[0]);assert.equal(claim.uri,url);assert.equal(claim.status,301)
 assert(matchesOnionProof(id,claim.fingerprint))
})
