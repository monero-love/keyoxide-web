// SPDX-License-Identifier: AGPL-3.0-or-later
// Offline demonstration: two logical mock endpoints, real disposable PGP keys.
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fixture,sign,address,MockTransport} from './test/helpers.js'
import {Verifier,Store} from './src/verifier.js'
const dir=mkdtempSync(join(tmpdir(),'simplex-demo-'))
let operator
try {
 operator=fixture()
 const transport=new MockTransport()
 transport.receive=async channel=>({channel,signature:await sign(transport.sent.at(-1).text,operator)})
 const verifier=new Verifier({transport,store:new Store(dir),identity:'monero.love/local-poc'})
 const result=await verifier.run({armoredKey:operator.publicKey,address,fingerprint:operator.fingerprint})
 console.log('OFFLINE MOCK TRANSPORT — this run makes no assertion of SimpleX delivery.')
 console.log(JSON.stringify(result,null,2))
} finally {operator?.cleanup();rmSync(dir,{recursive:true,force:true})}
