// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import * as pgp from 'openpgp'
export const address = 'https://simplex.chat/contact#/?v=2-7&smp=smp%3A%2F%2Fexample.invalid%2Ftest'
export function fixture(claim = address) {
  const dir = mkdtempSync(join(tmpdir(), 'simplex-pgp-'))
  const gpg = args => execFileSync('gpg', ['--homedir',dir,'--batch','--pinentry-mode','loopback','--passphrase','',...args], {encoding:'utf8',stdio:['ignore','pipe','pipe']})
  gpg(['--cert-notation',`proof@ariadne.id=${claim}`,'--quick-generate-key','Disposable Test <test@example.invalid>','ed25519','cert','1d'])
  const fingerprint = gpg(['--with-colons','--list-keys']).split('\n').find(s => s.startsWith('fpr:')).split(':')[9].toLowerCase()
  gpg(['--quick-add-key',fingerprint,'ed25519','sign','1d'])
  return { fingerprint, publicKey:gpg(['--armor','--export',fingerprint]), privateKey:gpg(['--armor','--export-secret-keys',fingerprint]),
    signWithGpg(text) { return execFileSync('gpg', ['--homedir',dir,'--batch','--pinentry-mode','loopback','--passphrase','','--local-user',fingerprint,'--armor','--detach-sign'], { input:text,encoding:'utf8',stdio:['pipe','pipe','pipe'] }) },
    cleanup() { try { execFileSync('gpgconf',['--homedir',dir,'--kill','gpg-agent']) } catch {} rmSync(dir,{recursive:true,force:true}) } }
}
export async function sign(text, fixture) {
  return pgp.sign({message:await pgp.createMessage({binary:new TextEncoder().encode(text)}),
    signingKeys:await pgp.readPrivateKey({armoredKey:fixture.privateKey}),detached:true})
}
export class MockTransport {
  constructor() { this.channel = {kind:'direct',userId:1,contactId:2,connectionId:3,address}; this.sent=[] }
  async connectAddress(value) { return {...this.channel,address:value} }
  async send(channel,text) { this.sent.push({channel,text}) }
  async receive() { return null }
}
