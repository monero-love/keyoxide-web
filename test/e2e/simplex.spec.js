// SPDX-License-Identifier: AGPL-3.0-or-later
import {test,expect} from '@playwright/test'
import {readFile} from 'node:fs/promises'
import {claimedKey} from '../../experiments/simplex-verifier/src/verifier.js'
import {parseRequest} from '../../experiments/simplex-verifier/src/request.js'

test('built browser assets preserve opt-in, exact signed claim and no network verification',async({page})=>{
 const errors=[],external=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.route('**/*',route=>{
  if(!route.request().url().startsWith('http://127.0.0.1:3337/')){external.push(route.request().url());return route.abort()}
  return route.continue()
 })
 await page.goto('/')
 const claim=page.locator('kx-claim')
 await expect(claim).toHaveAttribute('data-status','unchecked')
 await claim.locator('summary').first().click()
 const button=claim.getByRole('button',{name:'Save local verification request'})
 await expect(button).toBeDisabled()
 await expect(claim.getByText('Not checked',{exact:true})).toBeVisible()
 await claim.getByRole('checkbox').check()
 await expect(button).toBeEnabled()
 const [download]=await Promise.all([page.waitForEvent('download'),button.click()])
 const options=parseRequest(JSON.parse(await readFile(await download.path(),'utf8')))
 const key=await claimedKey(options.armoredKey,options.address,options.fingerprint)
 expect(key.getFingerprint()).toBe(options.fingerprint)
 await expect(claim).toHaveAttribute('data-status','unchecked')
 await expect(claim.getByRole('status')).toContainText('No SimpleX connection was started')
 await claim.getByRole('checkbox').uncheck()
 await expect(button).toBeDisabled()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
 expect(errors).toEqual([])
 expect(external).toEqual([])
})

for(const provider of ['github','dns']){
 test(`ordinary ${provider} proof succeeds through the production browser bundle`,async({page})=>{
  const errors=[];let proofs=0
  page.on('pageerror',error=>errors.push(error.message))
  await page.route('**/*',async route=>{
   const url=route.request().url()
   if(url==='https://api.github.com/gists/fixture-proof'||url.includes('/api/3/get/dns?')){
    proofs++
    const key=JSON.parse(await page.locator('kx-key').getAttribute('data-keydata'))
    const proof='openpgp4fpr:'+key.fingerprint
    const json=provider==='github'?{files:{'proof.md':{content:proof}}}:{domain:'fixture.example',records:{txt:[[proof]]}}
    return route.fulfill({json})
   }
   if(!url.startsWith('http://127.0.0.1:3337/'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'})
   return route.continue()
  })
  await page.goto('/'+provider)
  await expect(page.locator('kx-claim')).toHaveAttribute('data-status','success')
  expect(proofs).toBe(1)
  expect(errors).toEqual([])
 })
}


test('onion proof requires consent, matches exact profile identity and never fetches directly',async({page})=>{
 let requests=0;const external=[]
 await page.route('**/*',async route=>{
  const url=route.request().url()
  if(url.endsWith('/onion-proof/check')){
   requests++
   const claim=JSON.parse(await page.locator('kx-claim').getAttribute('data-claim'))
   return route.fulfill({json:{url:claim.uri,proof:requests===1?claim.proofs[0]:'openpgp4fpr:'+'f'.repeat(40)}})
  }
  if(!url.startsWith('http://127.0.0.1:3337/')){external.push(url);return route.abort()}
  return route.continue()
 })
 await page.goto('/onion-fixture')
 const claim=page.locator('kx-claim')
 await expect(claim).toHaveAttribute('data-status','unchecked')
 expect(requests).toBe(0)
 await claim.locator('summary').click()
 const button=claim.getByRole('button',{name:'Check onion proof through Tor'})
 await expect(button).toBeDisabled()
 await claim.getByRole('checkbox').check();await button.click()
 await expect(claim).toHaveAttribute('data-status','success')
 await expect(claim).toContainText('Proof matched via Tor')
 await button.click();await expect(claim).toHaveAttribute('data-status','failed')
 expect(requests).toBe(2);expect(external).toEqual([])
})
