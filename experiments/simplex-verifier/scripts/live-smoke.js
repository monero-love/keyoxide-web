// SPDX-License-Identifier: AGPL-3.0-or-later
// Opt-in integration test. Only creates and contacts these two disposable profiles.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Simplex } from '../src/simplex.js'
import { Store, Verifier } from '../src/verifier.js'
import { fixture } from '../test/helpers.js'
const dir = mkdtempSync(join(tmpdir(),'simplex-two-profiles-'))
const children = [], clients = []
let key
const watchdog = setTimeout(()=>{ for(const p of children)p.kill();process.exitCode=1 },180000)
try {
 for(const [name,port] of [['Verifier',15225],['Operator',15226]]) {
  children.push(spawn('./.local-bin/simplex-chat',['-d',join(dir,name),'-p',String(port),'--user-display-name',`POC${name}`,'--show-full-links'],{stdio:'ignore'}))
 }
 await new Promise(r=>setTimeout(r,3000))
 const verifierApi = new Simplex('ws://127.0.0.1:15225',1)
 const operatorApi = new Simplex('ws://127.0.0.1:15226',1)
 clients.push(verifierApi,operatorApi)
 const addressResponse = await operatorApi.command('/_address 1')
 if (addressResponse.type !== 'userContactLinkCreated') throw Error('address creation failed')
 const address = addressResponse.connLinkContact.connFullLink
 await operatorApi.command('/auto_accept on')
 key = fixture(address)
 console.log('Created two disposable profiles and a signed exact-address claim (values withheld).')
 const verifier = new Verifier({transport:verifierApi,store:new Store(join(dir,'state')),identity:'monero.love/local-poc'})
 const started = verifier.start({armoredKey:key.publicKey,address,fingerprint:key.fingerprint})
 // Attach rejection handler immediately while the operator waits for the event.
 started.catch(e=>console.error('Start failure:',e.message))
 const connected = await operatorApi.event(e=>e.type==='contactConnected' && e.user?.userId===1,60000)
 if(!connected) throw Error('operator connection timeout')
 const channel={kind:'direct',userId:1,contactId:connected.contact.contactId,connectionId:connected.contact.activeConn.connId}
 let received
 const messageEvent = await operatorApi.event(e=>{
  if(e.type!=='newChatItems'||e.user?.userId!==1)return false
  received=e.chatItems?.find(i=>i.chatInfo?.type==='direct'&&i.chatInfo.contact.contactId===channel.contactId&&i.chatItem.content?.type==='rcvMsgContent'&&i.chatItem.content.msgContent?.type==='text')
  return !!received
 },60000)
 if(!messageEvent) throw Error('operator did not receive challenge')
 const pending = await started
 const text=received.chatItem.content.msgContent.text
 if(text!==pending.text) throw Error('transport changed challenge bytes')
 // Test operator signs locally. In real manual use, the human reviews and signs
 // challenge.txt with GnuPG and pastes only the detached signature into this chat.
 await operatorApi.send(channel,key.signWithGpg(text))
 const response=await verifierApi.receive(verifier.store.read(pending.id).channel,60000)
 if(!response)throw Error('signature not received')
 const result=await verifier.finish(pending.id,response)
 console.log('PASS: real address connection, challenge delivery, local signing subkey, same-chat signature reply, verification.')
 try {await verifier.finish(pending.id,response);throw Error('replay accepted')}catch(e){if(!e.message.includes('EEXIST'))throw e}
 console.log('PASS: replay rejected. Result: '+result.result+'. No transcript retained.')
} catch(error) { console.error('FAIL:',error.message);process.exitCode=1 }
finally {
 clearTimeout(watchdog)
 for(const c of clients)c.close()
 await Promise.all(children.map(p=>new Promise(resolve=>{if(p.exitCode!==null)return resolve();p.once('exit',resolve);p.kill()})))
 key?.cleanup()
 rmSync(dir,{recursive:true,force:true})
}
