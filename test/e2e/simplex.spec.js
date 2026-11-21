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
