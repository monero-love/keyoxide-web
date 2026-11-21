// SPDX-License-Identifier: AGPL-3.0-or-later
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,chmodSync,symlinkSync,writeFileSync,existsSync,readFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {WebSocketServer} from 'ws'
import {Store} from '../src/state.js'
import {Simplex} from '../src/simplex.js'
import {Verifier} from '../src/verifier.js'
import {fixture,MockTransport,address,sign} from './helpers.js'
const id='a'.repeat(64)
test('state rejects shared directories, symlinks, and permissive record files',()=>{
 const dir=mkdtempSync(join(tmpdir(),'simplex-state-audit-'))
 try{
  chmodSync(dir,0o755);assert.throws(()=>new Store(dir),/0700/);chmodSync(dir,0o700)
  symlinkSync(dir,join(dir,'alias'));assert.throws(()=>new Store(join(dir,'alias')),/0700/)
  const store=new Store(dir);store.create({id});chmodSync(store.path(id),0o644)
  assert.throws(()=>store.read(id),/private/)
  rmSync(store.path(id));writeFileSync(join(dir,'target'),'{}',{mode:0o600});symlinkSync(join(dir,'target'),store.path(id))
  assert.throws(()=>store.read(id))
 }finally{rmSync(dir,{recursive:true,force:true})}
})
test('consuming a challenge deletes sensitive state and prevents restart replay',()=>{
 const dir=mkdtempSync(join(tmpdir(),'simplex-state-audit-'))
 try{
  const store=new Store(dir);store.create({id,address});store.consume(id)
  assert.equal(existsSync(store.path(id)),false)
  assert.equal(readFileSync(store.path(id)+'.used','utf8'),'')
  assert.throws(()=>new Store(dir).read(id),/already used/)
 }finally{rmSync(dir,{recursive:true,force:true})}
})
test('tampered persisted challenge text fails closed and is consumed',async()=>{
 const f=fixture(),dir=mkdtempSync(join(tmpdir(),'simplex-state-audit-'))
 try{
  const transport=new MockTransport(),store=new Store(dir)
  const v=new Verifier({transport,store,identity:'test'})
  const p=await v.start({armoredKey:f.publicKey,address,fingerprint:f.fingerprint})
  const record=store.read(p.id);record.challenge.address+='changed';writeFileSync(store.path(p.id),JSON.stringify(record))
  await assert.rejects(v.finish(p.id,{channel:transport.channel,signature:await sign(p.text,f)}),/invalid challenge state/)
  assert.throws(()=>store.read(p.id),/already used/)
 }finally{f.cleanup();rmSync(dir,{recursive:true,force:true})}
})
test('WebSocket API rejects nonliteral loopback, credentials, query and path overrides',()=>{
 for(const url of ['ws://localhost:5225','ws://example.com','wss://127.0.0.1','ws://user:password@127.0.0.1','ws://127.0.0.1/?x=y','ws://127.0.0.1/other'])assert.throws(()=>new Simplex(url,1))
})
test('malformed command response fails without crashing and disconnect cancels pending work',async()=>{
 const server=new WebSocketServer({host:'127.0.0.1',port:0})
 await new Promise(r=>server.once('listening',r))
 server.on('connection',socket=>socket.on('message',bytes=>{
  const {corrId,cmd}=JSON.parse(bytes)
  socket.send('null')
  if(cmd==='malformed')socket.send(JSON.stringify({corrId,resp:null}))
  else socket.close()
 }))
 const api=new Simplex(`ws://127.0.0.1:${server.address().port}`,1,1000)
 try{
  await assert.rejects(api.command('malformed'),/malformed/)
  await assert.rejects(api.command('disconnect'),/disconnected/)
  assert.equal(api.pending.size,0)
 }finally{api.close();await new Promise(r=>server.close(r))}
})
test('unsolicited event retention is bounded by count and bytes',async()=>{
 const server=new WebSocketServer({host:'127.0.0.1',port:0})
 await new Promise(r=>server.once('listening',r))
 server.on('connection',socket=>{
  for(let n=0;n<160;n++)socket.send(JSON.stringify({resp:{type:'newChatItems',padding:'x'.repeat(20000)}}))
  socket.send(JSON.stringify({resp:{type:'contactConnected',done:true}}))
 })
 const api=new Simplex(`ws://127.0.0.1:${server.address().port}`,1,1000)
 try{
  await api.ready;await api.event(e=>e.done===true,2000)
  assert.ok(api.events.length<=128);assert.ok(api.eventBytes<=2*1024*1024)
 }finally{api.close();await new Promise(r=>server.close(r))}
})


test('CLI input rejects symlinks, oversized files and invalid UTF-8',async()=>{
 const {readInput}=await import('../src/input.js')
 const dir=mkdtempSync(join(tmpdir(),'simplex-input-audit-'))
 try{
  const file=join(dir,'input');writeFileSync(file,'exact bytes')
  assert.equal(readInput(file,20),'exact bytes')
  assert.throws(()=>readInput(file,2),/bounded/)
  symlinkSync(file,join(dir,'link'));assert.throws(()=>readInput(join(dir,'link'),20))
  writeFileSync(file,Buffer.from([0xff]));assert.throws(()=>readInput(file,20))
 }finally{rmSync(dir,{recursive:true,force:true})}
})
