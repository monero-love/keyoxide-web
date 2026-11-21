// SPDX-License-Identifier: AGPL-3.0-or-later
import WebSocket from 'ws'
import { randomUUID } from 'node:crypto'
import { checkAddress } from './verifier.js'

export class Simplex {
  constructor(url, userId, timeout = 60000) {
    const parsed = new URL(url)
    if (parsed.protocol !== 'ws:' || !['127.0.0.1','[::1]'].includes(parsed.hostname) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw Error('local WebSocket only')
    if (!Number.isSafeInteger(userId) || userId < 1) throw Error('invalid user id')
    this.userId = userId
    this.timeout = timeout
    this.pending = new Map()
    this.events = []
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 120000) throw Error('invalid transport timeout')
    this.eventBytes = 0
    this.ws = new WebSocket(url, { maxPayload: 1024 * 1024, handshakeTimeout:timeout, perMessageDeflate:false, followRedirects:false })
    this.ready = new Promise((resolve,reject) => {
      this.ws.once('open',resolve)
      this.ws.once('error',reject)
      this.ws.once('close',()=>reject(Error('SimpleX disconnected before ready')))
    })
    this.ready.catch(()=>{}) // A command will observe the rejection, even if validation takes time.
    const fail = () => {
      for(const pending of this.pending.values())pending.fail(Error('SimpleX disconnected'))
      this.pending.clear()
    }
    this.ws.on('error',fail)
    this.ws.on('close',fail)
    this.ws.on('message', data => {
      let msg
      try { msg = JSON.parse(data.toString()) } catch { return }
      if (!msg || typeof msg !== 'object') return
      if (msg.corrId && this.pending.has(msg.corrId)) {
        this.pending.get(msg.corrId)(msg.resp)
      } else if (!msg.corrId && msg.resp && ['contactConnected','newChatItems'].includes(msg.resp.type)) {
        const size=Buffer.byteLength(JSON.stringify(msg.resp))
        if(size>2*1024*1024)return
        this.events.push(msg.resp)
        this.eventBytes+=size
        while(this.events.length>128 || this.eventBytes>2*1024*1024) {
          this.eventBytes-=Buffer.byteLength(JSON.stringify(this.events.shift()))
        }
      }
    })
  }
  async command(cmd) {
    await this.ready
    const corrId = randomUUID()
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => { this.pending.delete(corrId); reject(Error('SimpleX command timeout')) }, this.timeout)
      const finish = resp => {
        clearTimeout(timer); this.pending.delete(corrId)
        if (!resp || typeof resp.type !== 'string') reject(Error('malformed SimpleX response'))
        else if (resp.type === 'chatCmdError') reject(Error('SimpleX command rejected'))
        else resolve(resp)
      }
      finish.fail = error => { clearTimeout(timer);this.pending.delete(corrId);reject(error) }
      this.pending.set(corrId,finish)
      this.ws.send(JSON.stringify({corrId,cmd}),error=>{if(error)finish.fail(error)})
    })
  }
  async event(predicate, timeout) {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      const index = this.events.findIndex(predicate)
      if (index >= 0) {
        const event=this.events.splice(index,1)[0]
        this.eventBytes-=Buffer.byteLength(JSON.stringify(event))
        return event
      }
      if (this.ws.readyState === WebSocket.CLOSED) throw Error('SimpleX disconnected')
      await new Promise(r => setTimeout(r, 25))
    }
    return null
  }
  async connectAddress(address) {
    checkAddress(address)
    const plan = await this.command(`/_connect plan ${this.userId} ${address}`)
    if (plan.type !== 'connectionPlan' || plan.user?.userId !== this.userId ||
        plan.connectionPlan?.type !== 'contactAddress' ||
        plan.connectionPlan.contactAddressPlan?.type !== 'ok' ||
        plan.connectionPlan.contactAddressPlan?.contactSLinkData_?.business ||
        plan.connLink?.connFullLink !== address) throw Error('not a fresh reusable full contact address')
    const sent = await this.command(`/_connect ${this.userId} ${address}`)
    if (sent.type !== 'sentInvitation' || sent.user?.userId !== this.userId ||
        !sent.connection?.viaContactUri || sent.connection?.groupLinkId ||
        !Number.isSafeInteger(sent.connection?.pccConnId)) throw Error('not a direct address connection')
    const connectionId = sent.connection.pccConnId
    const connected = await this.event(e => e.type === 'contactConnected' && e.user?.userId === this.userId &&
      e.contact?.activeConn?.connId === connectionId, this.timeout)
    if (!connected) throw Error('contact connection timeout')
    const conn = connected.contact.activeConn
    if (conn.viaGroupLink || conn.groupLinkId || !Number.isSafeInteger(connected.contact.contactId)) throw Error('group connection rejected')
    return { kind:'direct', userId:this.userId, contactId:connected.contact.contactId, connectionId, address }
  }
  async send(channel, text) {
    const result = await this.command(`/_send @${channel.contactId} json ${JSON.stringify([{msgContent:{type:'text',text}}])}`)
    if (result.type !== 'newChatItems' || result.user?.userId !== this.userId) throw Error('send failed')
  }
  async receive(channel, timeout) {
    let item
    const event = await this.event(e => {
      if (e.type !== 'newChatItems' || e.user?.userId !== channel.userId) return false
      if (!Array.isArray(e.chatItems)) return false
      item = e.chatItems.find(i => i?.chatInfo?.type === 'direct' &&
        i.chatInfo.contact?.contactId === channel.contactId &&
        i.chatInfo.contact?.activeConn?.connId === channel.connectionId &&
        i.chatItem?.content?.type === 'rcvMsgContent' &&
        i.chatItem.content.msgContent?.type === 'text' &&
        typeof i.chatItem.content.msgContent.text === 'string' &&
        i.chatItem.content.msgContent.text.length <= 32000 &&
        i.chatItem.content.msgContent.text.startsWith('-----BEGIN PGP SIGNATURE-----'))
      return !!item
    }, timeout)
    return event ? { channel, signature:item.chatItem.content.msgContent.text } : null
  }
  close() { this.events=[];this.eventBytes=0;this.ws.terminate() }
}
