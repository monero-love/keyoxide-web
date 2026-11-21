// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import pug from 'pug'
import express from 'express'
import esmock from 'esmock'
import { Claim, Profile, Persona } from 'doipjs'
import { isSimplexClaim } from '../src/shared/simplex.js'
import { matchClaim, verifyProfileClaims } from '../src/server/claimVerification.js'
import { parseRequest } from '../experiments/simplex-verifier/src/request.js'

const address = 'https://simplex.chat/contact#/?v=2-7&smp=smp%3A%2F%2Fexample.invalid%2Ftest'
const fingerprint = 'a'.repeat(40)
const publicKey = { fingerprint, encodedKey: '-----BEGIN PGP PUBLIC KEY BLOCK-----\nfixture\n-----END PGP PUBLIC KEY BLOCK-----' }
const makeClaim = uri => new Claim(uri, `openpgp4fpr:${fingerprint}`)
const makeProfile = () => new Profile('openpgp', `openpgp4fpr:${fingerprint}`, [new Persona('Local test', [matchClaim(makeClaim(address))])])

describe('SimpleX explicit verification boundary', () => {
  it('preserves exact bytes without generic provider matches', () => {
    for (const uri of [address, address.replace('https://simplex.chat/', 'simplex:/')]) {
      const claim = matchClaim(makeClaim(uri)).toJSON()
      assert.equal(claim.uri, uri)
      assert.deepEqual(claim.matches, [])
      assert.equal(claim.status, 301)
    }
  })
  it('reserves unsupported SimpleX links without confusing unrelated domains', () => {
    for (const uri of ['simplex:/invitation#/?v=2', 'https://simplex.chat/a/short', 'https://simplex.chat/contact#group', 'HTTPS://SIMPLEX.CHAT/contact#test']) assert.equal(isSimplexClaim(uri), true)
    for (const uri of ['https://simplex.chat.evil.test/contact', 'https://example.com/simplex.chat', 'dns:example.com', undefined]) assert.equal(isSimplexClaim(uri), false)
  })
  it('does not fetch SimpleX proofs, but still verifies ordinary claims', async () => {
    let ordinaryCalls = 0
    const simplex = makeClaim(address)
    simplex.verify = () => { throw Error('SimpleX must never be fetched') }
    const ordinary = makeClaim('dns:example.com?type=TXT')
    ordinary.verify = async () => { ordinaryCalls++ }
    const profile = { personas: [{ claims: [simplex, ordinary] }] }
    await verifyProfileClaims(profile, {})
    assert.equal(ordinaryCalls, 1)
    assert.deepEqual(profile.personas[0].claims[0].toJSON().matches, [])
  })
  it('removes imported verification success for SimpleX', async () => {
    const claim = Claim.fromJSON({claimVersion:2,uri:address,proofs:[`openpgp4fpr:${fingerprint}`],matches:[],status:200})
    const profile = {personas:[{claims:[claim]}]}
    await verifyProfileClaims(profile, {})
    assert.equal(profile.personas[0].claims[0].status, 301)
  })
  it('propagates ordinary verification failures instead of hanging', async () => {
    const claim = makeClaim('dns:example.com?type=TXT')
    claim.verify = async () => { throw Error('ordinary failure') }
    await assert.rejects(verifyProfileClaims({personas:[{claims:[claim]}]}, {}), /ordinary failure/)
  })

  describe('rendered browser handoff', () => {
    let dom, oldDocument, oldHTMLElement, ClaimElement, oldBlob, oldCreate, oldRevoke, blobs, clicks
    before(async () => {
      dom = new JSDOM('<body></body>', {url:'http://localhost/'})
      oldDocument = globalThis.document
      oldHTMLElement = globalThis.HTMLElement
      oldBlob = globalThis.Blob
      oldCreate = URL.createObjectURL
      oldRevoke = URL.revokeObjectURL
      globalThis.document = dom.window.document
      globalThis.HTMLElement = dom.window.HTMLElement
      // Retain Blob bytes without exercising jsdom's unimplemented download navigation.
      globalThis.Blob = class { constructor(parts) { this.text = parts.join('') } }
      URL.createObjectURL = blob => { blobs.push(blob); return 'blob:local-test' }
      URL.revokeObjectURL = () => {}
      dom.window.HTMLAnchorElement.prototype.click = function () { clicks++ }
      ClaimElement = (await import('../static-src/kx-claim.js')).Claim
    })
    after(() => {
      globalThis.document = oldDocument
      globalThis.HTMLElement = oldHTMLElement
      globalThis.Blob = oldBlob
      URL.createObjectURL = oldCreate
      URL.revokeObjectURL = oldRevoke
      dom.window.close()
    })
    function render(uri = address, key = publicKey) {
      blobs = []; clicks = 0
      const profile = makeProfile()
      profile.personas[0].claims = [matchClaim(Claim.fromJSON({claimVersion:2,uri,proofs:[`openpgp4fpr:${fingerprint}`],matches:[],status:100}))]
      Object.assign(profile.publicKey, key)
      document.body.innerHTML = pug.renderFile('views/profile.pug', {
        data:profile.toJSON(), isSimplexClaim,
        meta:{keyoxide:{sourceUrl:'https://example.invalid',semver:'test'}}
      })
      return document.querySelector('kx-claim')
    }
    it('renders unmatched scheme claims server-side with no spinner or success', () => {
      const root = render(address.replace('https://simplex.chat/', 'simplex:/'))
      assert.equal(root.dataset.skip, 'true')
      assert.equal(root.dataset.status, 'unchecked')
      assert.equal(root.querySelector('.subtitle').textContent, 'Not checked')
      assert.ok(root.textContent.includes('simplex:/contact#'))
    })
    it('page initialization never calls the SimpleX verifier', async () => {
      const root = render()
      root.verify = () => { throw Error('automatic verification attempted') }
      const { init } = await import('../static-src/keyoxide.js')
      init()
      assert.equal(blobs.length, 0)
      assert.equal(clicks, 0)
    })
    it('direct verify calls still cannot invoke doipjs for SimpleX', async () => {
      const root = render()
      root.updateContent = value => ClaimElement.prototype.updateContent.call(root, value)
      await ClaimElement.prototype.verify.call(root)
      assert.equal(root.dataset.status, 'unchecked')
      assert.equal(clicks, 0)
    })
    it('requires explicit consent and exports exact bytes and matching public key', () => {
      const root = render()
      ClaimElement.prototype.updateContent.call(root, root.dataset.claim)
      const button = root.querySelector('button')
      assert.equal(button.disabled, true)
      button.click()
      assert.equal(clicks, 0)
      const consent = root.querySelector('input[type=checkbox]')
      consent.checked = true
      consent.dispatchEvent(new dom.window.Event('change'))
      button.click()
      assert.equal(clicks, 1)
      const request = JSON.parse(blobs[0].text)
      assert.deepEqual(parseRequest(request), {address, fingerprint, armoredKey:publicKey.encodedKey})
      assert.equal(root.dataset.status, 'unchecked')
      assert.match(root.querySelector('[role=status]').textContent, /No SimpleX connection/)
      consent.checked = false
      consent.dispatchEvent(new dom.window.Event('change'))
      assert.equal(button.disabled, true)
    })
    it('does not offer downloads for invitations, short links or non-OpenPGP keys', () => {
      for (const [uri, key] of [
        ['simplex:/invitation#/?v=2', publicKey],
        ['https://simplex.chat/a/short', publicKey],
        [address, {fingerprint:'asp-key',encodedKey:'not OpenPGP'}]
      ]) {
        const root = render(uri, key)
        ClaimElement.prototype.updateContent.call(root, root.dataset.claim)
        assert.equal(root.querySelector('button'), null)
        assert.equal(clicks, 0)
      }
    })
    it('treats address and embedded public-key HTML as text', () => {
      const hostile = address + '<img src=x onerror=alert(1)>'
      const root = render(hostile, {...publicKey,encodedKey:publicKey.encodedKey+'\n</script><script>attack()</script>'})
      assert.equal(document.querySelectorAll('script').length, 3)
      const embedded = document.querySelector('script').textContent.match(/publicKey: (.*)/)[1]
      assert.equal(JSON.parse(embedded).encodedKey, publicKey.encodedKey+'\n</script><script>attack()</script>')
      ClaimElement.prototype.updateContent.call(root, root.dataset.claim)
      assert.equal(root.querySelector('code').textContent, hostile)
      assert.equal(root.querySelector('code img'), null)
    })
  })

  describe('HTTP API', () => {
    let server, base, oldVerification
    before(() => { oldVerification = process.env.ENABLE_SERVER_VERIFICATION; process.env.ENABLE_SERVER_VERIFICATION = 'true' })
    after(() => { if (oldVerification === undefined) delete process.env.ENABLE_SERVER_VERIFICATION; else process.env.ENABLE_SERVER_VERIFICATION = oldVerification })
    before(async () => {
      const module = await esmock('../src/api/v3/keyoxide_profile.js', {
        '../src/server/index.js': { generateAutoProfile: async () => makeProfile() }
      })
      const app = express()
      app.use('/profile', module.default)
      server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
      base = `http://127.0.0.1:${server.address().port}/profile`
    })
    after(async () => { if (server) await new Promise(resolve => server.close(resolve)) })
    it('fetch with doVerification=true leaves SimpleX unchecked', async () => {
      const response = await fetch(base+'/fetch?query=fixture&doVerification=true')
      assert.equal(response.status, 200)
      const claim = (await response.json()).personas[0].claims[0]
      assert.equal(claim.uri, address)
      assert.equal(claim.status, 301)
      assert.deepEqual(claim.matches, [])
    })
    it('verify clears claimed success without fetching a SimpleX proof', async () => {
      const profile = makeProfile().toJSON()
      profile.personas[0].claims[0].status = 200
      const response = await fetch(base+'/verify?'+new URLSearchParams({data:JSON.stringify(profile)}))
      assert.equal(response.status, 200)
      assert.equal((await response.json()).personas[0].claims[0].status, 301)
    })
    it('rejects malformed imported profiles', async () => {
      const response = await fetch(base+'/verify?data=%7B%7D')
      assert.equal(response.status, 400)
    })
  })
})
