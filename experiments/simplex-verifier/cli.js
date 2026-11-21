// SPDX-License-Identifier: AGPL-3.0-or-later
import { readInput } from './src/input.js'
import { Simplex } from './src/simplex.js'
import { Verifier, Store, claimedKey } from './src/verifier.js'
import { parseRequest } from './src/request.js'
// Explicit invocation only. Downloaded envelopes are input, never trusted proof.
let transport
try {
  const args = process.argv.slice(2)
  let options, ws, uid, stateDir
  if (args[0] === '--request' && args.length === 5) {
    options = parseRequest(JSON.parse(readInput(args[1], 2*1024*1024)))
    ;[, , ws, uid, stateDir] = args
  } else if (args.length === 6) {
    const [keyFile, addressFile, fingerprint] = args
    ;[, , , ws, uid, stateDir] = args
    options = {armoredKey:readInput(keyFile,1024*1024), address:readInput(addressFile,16000), fingerprint}
  } else {
    throw Error('Usage: node cli.js --request request.json ws://127.0.0.1:5225 USER_ID PRIVATE_STATE_DIR\nOr: node cli.js public.asc address.txt PRIMARY_FINGERPRINT ws://127.0.0.1:5225 USER_ID PRIVATE_STATE_DIR')
  }
  // Validate cryptographic claim before even opening the local transport.
  await claimedKey(options.armoredKey, options.address, options.fingerprint)
  transport = new Simplex(ws, Number(uid))
  const verifier = new Verifier({ transport, store:new Store(stateDir), identity:'monero.love/local-poc' })
  console.log(JSON.stringify(await verifier.run(options),null,2))
} catch (error) { console.error('Not checked:', error.message); process.exitCode=1 }
finally { transport?.close() }
