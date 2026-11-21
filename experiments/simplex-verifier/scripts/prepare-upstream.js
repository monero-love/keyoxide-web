// SPDX-License-Identifier: AGPL-3.0-or-later
// Explicit network setup for the optional upstream compatibility test.
import {readFileSync,existsSync,mkdirSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
const lock=JSON.parse(readFileSync('upstream-lock.json','utf8')).repositories.doipjs
const dir='upstream/doipjs'
mkdirSync('upstream',{recursive:true})
if(!existsSync(dir)) execFileSync('git',['clone',lock.url,dir],{stdio:'inherit'})
const origin=execFileSync('git',['-C',dir,'remote','get-url','origin'],{encoding:'utf8'}).trim()
if(origin!==lock.url)throw Error('Unexpected upstream remote')
if(execFileSync('git',['-C',dir,'status','--porcelain'],{encoding:'utf8'}).trim())throw Error('Upstream checkout has local changes')
execFileSync('git',['-C',dir,'fetch','origin',lock.commit],{stdio:'inherit'})
execFileSync('git',['-C',dir,'checkout','--detach',lock.commit],{stdio:'inherit'})
execFileSync('npm',['ci','--ignore-scripts','--omit=dev','--no-audit','--no-fund'],{cwd:dir,stdio:'inherit'})
