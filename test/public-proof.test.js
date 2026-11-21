// SPDX-License-Identifier: AGPL-3.0-or-later
import {test} from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import {once} from 'node:events'
import {publicProofRouter} from '../src/api/v3/public_proof.js'
import {publicURL} from '../src/server/publicFetch.js'

test('restricted HTTP proxy preserves text/JSON and rejects unsafe destinations and SimpleX claims',async()=>{
 const calls=[];const app=express()
 app.set('query parser','simple')
 app.use(publicProofRouter({fetchBytes:async(url,options)=>{publicURL(url);calls.push({url,options});return Buffer.from('{"proof":"verified fixture"}')}}))
 const server=app.listen(0,'127.0.0.1');await once(server,'listening')
 const base=`http://127.0.0.1:${server.address().port}`
 const get=(url,format='text')=>fetch(base+'/http?'+new URLSearchParams({url,format}))
 try{
  const text=await get('https://example.com/proof')
  assert.match(text.headers.get('content-type'),/^text\/plain/)
  assert.equal(await text.text(),'{"proof":"verified fixture"}')
  assert.deepEqual(await (await get('https://example.com/proof','json')).json(),{proof:'verified fixture'})
  assert.deepEqual(calls[0].options,{timeout:5000,maxBytes:1048576})
  for(const url of ['http://example.com','https://127.0.0.1/','https://169.254.169.254/','https://simplex.chat/contact#fake','https://example.com:8443/'])assert.equal((await get(url)).status,400)
  assert.equal((await fetch(base+'/http?url[]=https://example.com&format=text')).status,400)
  assert.equal((await fetch(base+'/graphql')).status,501)
 }finally{await new Promise(r=>server.close(r))}
})

test('DNS proxy uses only fixed public recursors and keeps TXT chunk structure',async()=>{
 let servers,queries=0
 const app=express()
 app.use(publicProofRouter({resolverFactory:()=>({setServers(value){servers=value},cancel(){},async resolveTxt(domain){queries++;return [['openpgp4fpr:','TEST']]}})}))
 const server=app.listen(0,'127.0.0.1');await once(server,'listening')
 const base=`http://127.0.0.1:${server.address().port}`
 try{
  assert.deepEqual(await (await fetch(base+'/dns?domain=example.com')).json(),{domain:'example.com',records:{txt:[['openpgp4fpr:','TEST']]}})
  assert.deepEqual(servers,['1.1.1.1','1.0.0.1'])
  for(const domain of ['localhost','private.internal','host.local','127.0.0.1','example.com/path'])assert.equal((await fetch(base+'/dns?'+new URLSearchParams({domain}))).status,400)
  assert.equal(queries,1)
 }finally{await new Promise(r=>server.close(r))}
})

test('proof proxy bounds concurrent upstream work',async()=>{
 let release;const pending=new Promise(resolve=>{release=resolve})
 let started=0
 const app=express();app.use(publicProofRouter({fetchBytes:async()=>{started++;await pending;return Buffer.from('ok')}}))
 const server=app.listen(0,'127.0.0.1');await once(server,'listening')
 const url=`http://127.0.0.1:${server.address().port}/http?url=https://example.com&format=text`
 const requests=Array.from({length:8},()=>fetch(url))
 try{
  while(started<8)await new Promise(r=>setTimeout(r,5))
  assert.equal((await fetch(url)).status,503)
 }finally{release();await Promise.all(requests);await new Promise(r=>server.close(r))}
})
