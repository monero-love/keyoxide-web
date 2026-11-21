// SPDX-License-Identifier: AGPL-3.0-or-later
import {readFileSync,readdirSync} from 'node:fs'
const files=[]
function walk(dir){
 for(const entry of readdirSync(dir,{withFileTypes:true})){
  if(entry.name.startsWith('.')||entry.name==='node_modules'||entry.name==='upstream')continue
  const file=`${dir}/${entry.name}`
  if(entry.isDirectory())walk(file)
  else if(/\.(js|py)$/.test(file))files.push(file)
 }
}
for(const dir of ['src','static-src','scripts','test','experiments'])walk(dir)
for(const entry of readdirSync('.',{withFileTypes:true}))if(entry.isFile()&&/\.js$/.test(entry.name))files.push(entry.name)
const missing=files.filter(f=>!/(SPDX-License-Identifier: AGPL-3.0-or-later|GNU Affero General Public License)/.test(readFileSync(f,'utf8')))
if(!readFileSync('LICENSE','utf8').includes('GNU AFFERO GENERAL PUBLIC LICENSE'))throw Error('Root license missing')
if(missing.length)throw Error('Missing source license notices: '+missing.join(', '))
console.log(`PASS: AGPL notices on ${files.length} source files and root license present. Generated files and dependencies excluded.`)
