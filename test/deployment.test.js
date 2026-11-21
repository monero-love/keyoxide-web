// SPDX-License-Identifier: AGPL-3.0-or-later
import {test} from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import {once} from 'node:events'
import {configureDeployment,trustedProxy} from '../src/server/deployment.js'

test('proxy trust is explicit, exact and handles IPv4-mapped socket addresses',()=>{
 assert.equal(trustedProxy()('127.0.0.1'),false)
 const trust=trustedProxy('127.0.0.1, ::1')
 assert.equal(trust('::ffff:127.0.0.1'),true)
 assert.equal(trust('::1'),true)
 assert.equal(trust('127.0.0.2'),false)
 for(const unsafe of ['true','1','loopback','0.0.0.0/0','10.0.0.0/8','example.com',',127.0.0.1'])assert.throws(()=>trustedProxy(unsafe))
})

test('trusted proxy separates client quotas, blocks spoofed chains and leaves health available',async()=>{
 const app=express()
 configureDeployment(app,{TRUST_PROXY_IPS:'127.0.0.1',RATE_LIMIT_MAX:'2'},{version:'test',revision:'test-revision'})
 app.get('/',(req,res)=>res.json({ip:req.ip}))
 const server=app.listen(0,'127.0.0.1');await once(server,'listening')
 const url=`http://127.0.0.1:${server.address().port}`
 const request=ip=>fetch(url,{headers:{'X-Forwarded-For':ip}})
 try{
  assert.equal((await request('192.0.2.1')).status,200)
  assert.equal((await request('192.0.2.99, 192.0.2.1')).status,200)
  const limited=await request('192.0.2.88, 192.0.2.1')
  assert.equal(limited.status,429)
  assert.equal(limited.headers.get('X-Content-Type-Options'),'nosniff')
  assert.ok(limited.headers.get('Retry-After'))
  assert.equal((await request('192.0.2.2')).status,200)
  for(let n=0;n<5;n++)assert.equal((await fetch(url+'/healthz')).status,200)
  assert.equal((await (await fetch(url+'/healthz')).json()).revision,'test-revision')
 }finally{await new Promise(r=>server.close(r))}
})

test('deployment refuses malformed or unbounded request quotas',()=>{
 for(const value of ['0','-1','Infinity','1.5','10001'])assert.throws(()=>configureDeployment(express(),{RATE_LIMIT_MAX:value},{}))
})

test('untrusted peers cannot use forwarding headers to obtain new rate-limit buckets',async()=>{
 const app=express()
 configureDeployment(app,{TRUST_PROXY_IPS:'192.0.2.254',RATE_LIMIT_MAX:'1'},{version:'test'})
 app.get('/',(req,res)=>res.json({ip:req.ip}))
 const server=app.listen(0,'127.0.0.1');await once(server,'listening')
 const url=`http://127.0.0.1:${server.address().port}`
 try{
  const first=await fetch(url,{headers:{'X-Forwarded-For':'198.51.100.1'}})
  assert.equal(first.status,200)
  assert.equal((await first.json()).ip,'127.0.0.1')
  assert.equal((await fetch(url,{headers:{'X-Forwarded-For':'198.51.100.2'}})).status,429)
 }finally{await new Promise(r=>server.close(r))}
})
