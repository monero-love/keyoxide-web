// SPDX-License-Identifier: AGPL-3.0-or-later
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import pug from 'pug'

const meta={keyoxide:{semver:'candidate-test',sourceUrl:'/source.tar.gz'}}
test('lightweight homepage preserves search and only explicitly enabled analytics',()=>{
 const onion=pug.renderFile('views/index.pug',{meta,settings:{enable_analytics:false,onion_url:'http://example.onion'}})
 assert.match(onion,/search\.js\?v=candidate-test/)
 assert.doesNotMatch(onion,/openpgp\.js|analytics\/script\.js|static\/analytics\.js/)
 const web=pug.renderFile('views/index.pug',{meta,settings:{enable_analytics:true}})
 assert.match(web,/\/analytics\/script\.js/)
 assert.match(web,/\/static\/analytics\.js\?v=candidate-test/)
 assert.doesNotMatch(web,/openpgp\.js/)
})

test('preserved analytics mask profile identifiers and honor privacy opt-outs',()=>{
 const script=readFileSync('static-src/files/analytics.js','utf8')
 function run(overrides={}){
  const calls=[]
  const context={location:{hostname:'keyoxide.net',pathname:'/private-profile',search:'?private=yes',hash:'#secret'},navigator:{},localStorage:{getItem:()=>null},window:{plausible:(...args)=>calls.push(args)},...overrides}
  vm.runInNewContext(script,context)
  return calls
 }
 const result=run()
 assert.equal(result.length,1)
 assert.equal(result[0][1].u,'https://keyoxide.net/profile')
 assert.equal(run({navigator:{globalPrivacyControl:true}}).length,0)
 assert.equal(run({navigator:{doNotTrack:'1'}}).length,0)
 assert.equal(run({localStorage:{getItem:()=> 'true'}}).length,0)
 assert.equal(run({location:{hostname:'example.onion'}}).length,0)
})
