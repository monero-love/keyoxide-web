// SPDX-License-Identifier: AGPL-3.0-or-later
import {test} from 'node:test'
import assert from 'node:assert/strict'
import esmock from 'esmock'
import {JSDOM} from 'jsdom'
import {isPublicAddress,publicURL,fetchPublicBytes} from '../src/server/publicFetch.js'
import {setSafeLink} from '../static-src/safe-dom.js'

test('SSRF: rejects private, loopback, mapped, link-local, multicast and reserved IPs',()=>{
 for(const ip of ['127.0.0.1','127.22.1.3','10.1.2.3','172.16.1.2','192.168.1.2','169.254.169.254','0.0.0.0','100.64.0.1','224.1.1.1','192.0.2.1','::1','::','fe80::1','fc00::1','::ffff:127.0.0.1','2001:db8::1'])assert.equal(isPublicAddress(ip),false,ip)
 for(const ip of ['1.1.1.1','8.8.8.8','2606:4700:4700::1111'])assert.equal(isPublicAddress(ip),true,ip)
})
test('SSRF: rejects protocol, credential, port and numeric-host bypasses before fetch',async()=>{
 for(const url of ['http://example.com','file:///etc/passwd','https://user:secret@example.com','https://example.com:8443','https://2130706433','https://0x7f000001','https://127.1','https://[::ffff:127.0.0.1]']){
  assert.throws(()=>publicURL(url),undefined,url)
  await assert.rejects(fetchPublicBytes(url))
 }
})
test('SSRF: rejects mixed public/private DNS answers and pins approved answers',async()=>{
 let calls=0
 const mock=await esmock('../src/server/publicFetch.js',{'node:dns/promises':{lookup:async()=>{calls++;return [{address:'1.1.1.1',family:4},{address:'10.0.0.1',family:4}]}}})
 await assert.rejects(new Promise((resolve,reject)=>mock.publicLookup('example.test',{},(err,value)=>err?reject(err):resolve(value))))
 assert.equal(calls,1)
 const good=await esmock('../src/server/publicFetch.js',{'node:dns/promises':{lookup:async()=>[{address:'1.1.1.1',family:4}]}})
 assert.deepEqual(await new Promise((resolve,reject)=>good.publicLookup('example.test',{all:true},(err,value)=>err?reject(err):resolve(value))),[{address:'1.1.1.1',family:4}])
})
test('XSS: untrusted link text cannot become HTML or executable URL',()=>{
 const old=globalThis.document
 const dom=new JSDOM('<div></div>');globalThis.document=dom.window.document
 try {
  const element=document.querySelector('div')
  for(const input of ['javascript:alert(1)','data:text/html,<script>alert(1)</script>','https://example.com/\"><img src=x onerror=alert(1)>']){
   setSafeLink(element,'Link: ',input)
   assert.equal(element.querySelector('img'),null)
   assert.equal(element.querySelector('script'),null)
   if(!input.startsWith('https:'))assert.equal(element.querySelector('a'),null)
  }
 }finally{globalThis.document=old;dom.window.close()}
})

test('SSRF: redirected private destination is rejected before another socket is opened',async()=>{
 const {EventEmitter}=await import('node:events')
 let calls=0
 const module=await esmock('../src/server/publicFetch.js',{'node:https':{get:(_url,_options,cb)=>{
  calls++
  const req=new EventEmitter()
  queueMicrotask(()=>cb({statusCode:302,headers:{location:'https://169.254.169.254/latest/meta-data'},destroy(){}}))
  return req
 }}})
 await assert.rejects(module.fetchPublicBytes('https://example.com'),/public HTTPS/)
 assert.equal(calls,1)
})

test('SSRF: oversized response is aborted, not buffered without limit',async()=>{
 const {EventEmitter}=await import('node:events')
 const {PassThrough}=await import('node:stream')
 const module=await esmock('../src/server/publicFetch.js',{'node:https':{get:(_url,_options,cb)=>{
  const req=new EventEmitter()
  queueMicrotask(()=>{
   const res=new PassThrough();res.statusCode=200;res.headers={};cb(res)
   res.end(Buffer.alloc(101))
  })
  return req
 }}})
 await assert.rejects(module.fetchPublicBytes('https://example.com',{maxBytes:100}),/size limit/)
})
