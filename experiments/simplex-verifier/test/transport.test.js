// SPDX-License-Identifier: AGPL-3.0-or-later
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {Simplex} from '../src/simplex.js'
import {address} from './helpers.js'
function adapter({planType='contactAddress',planState='ok',sentType='sentInvitation',group=false,wrongConnection=false}={}) {
 const api=Object.create(Simplex.prototype)
 api.userId=1;api.timeout=1
 api.commands=[]
 api.command=async cmd=>{
  api.commands.push(cmd)
  if(cmd.startsWith('/_connect plan'))return {type:'connectionPlan',user:{userId:1},connLink:{connFullLink:address},connectionPlan:{type:planType,contactAddressPlan:{type:planState}}}
  return {type:sentType,user:{userId:1},connection:{viaContactUri:true,pccConnId:3,groupLinkId:group?'group':undefined}}
 }
 api.event=async predicate=>{
  const event={type:'contactConnected',user:{userId:1},contact:{contactId:2,activeConn:{connId:wrongConnection?44:3}}}
  return predicate(event)?event:null
 }
 return api
}
test('adapter connects exact link and binds pending connection to direct contact',async()=>{const api=adapter();const c=await api.connectAddress(address);assert.equal(c.connectionId,3);assert.equal(c.contactId,2);assert.equal(api.commands[1],`/_connect 1 ${address}`)})
test('engine-classified invitations and groups rejected before connect',async()=>{for(const planType of ['invitationLink','groupLink','error']){const api=adapter({planType});await assert.rejects(api.connectAddress(address));assert.equal(api.commands.length,1)}})
test('known contacts and reconnect plans rejected',async()=>{for(const planState of ['known','ownLink','connectingConfirmReconnect','connectingProhibit','contactViaAddress']){const api=adapter({planState});await assert.rejects(api.connectAddress(address));assert.equal(api.commands.length,1)}})
test('sent confirmation, group connection, unrelated contactConnected rejected',async()=>{for(const options of [{sentType:'sentConfirmation'},{group:true},{wrongConnection:true}])await assert.rejects(adapter(options).connectAddress(address))})
test('receive ignores outgoing, group and other-contact messages',async()=>{
 const api=adapter(),channel={kind:'direct',userId:1,contactId:2,connectionId:3,address}
 const item={chatInfo:{type:'direct',contact:{contactId:2,activeConn:{connId:3}}},chatItem:{content:{type:'rcvMsgContent',msgContent:{type:'text',text:'-----BEGIN PGP SIGNATURE-----\nfixture'}}}}
 api.event=async predicate=>{
  for(const change of [i=>i.chatInfo.type='group',i=>i.chatInfo.contact.contactId=9,i=>i.chatItem.content.type='sndMsgContent',i=>i.chatInfo.contact.activeConn.connId=8]){
   const bad=structuredClone(item);change(bad);assert.equal(predicate({type:'newChatItems',user:{userId:1},chatItems:[bad]}),false)
  }
  const good={type:'newChatItems',user:{userId:1},chatItems:[item]};assert.equal(predicate(good),true);return good
 }
 assert.equal((await api.receive(channel,1)).signature,item.chatItem.content.msgContent.text)
})
