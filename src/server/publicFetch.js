// SPDX-License-Identifier: AGPL-3.0-or-later
import https from 'node:https'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import ipaddr from 'ipaddr.js'

export function isPublicAddress (address) {
  try {
    return ipaddr.process(address).range() === 'unicast'
  } catch { return false }
}

export function publicURL (input) {
  const url = new URL(input)
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (url.protocol !== 'https:' || url.username || url.password ||
      (url.port && url.port !== '443') || (isIP(host) && !isPublicAddress(host))) {
    throw new Error('Only public HTTPS profile sources on port 443 are allowed')
  }
  return url
}

// Validate every DNS answer and pass that exact answer to the socket lookup.
// No second resolver call, and no inherited HTTP proxy environment variables.
export async function publicLookup (hostname, options, callback) {
  try {
    const addresses = await lookup(hostname, { all: true })
    if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) {
      throw new Error('Private or reserved profile destination rejected')
    }
    const family = typeof options === 'number' ? options : options.family
    const candidates = family ? addresses.filter(item => item.family === family) : addresses
    if (!candidates.length) throw new Error('No public address for requested family')
    if (options.all) callback(null, candidates)
    else callback(null, candidates[0].address, candidates[0].family)
  } catch (error) { callback(error) }
}

export async function fetchPublicBytes (input, { maxBytes = 1024 * 1024, timeout = 10000 } = {}) {
  const deadline = Date.now() + timeout
  let url = publicURL(input)
  for (let redirect = 0; redirect <= 3; redirect++) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new Error('Profile fetch timed out')
    const result = await new Promise((resolve, reject) => {
      const request = https.get(url, {
        lookup: publicLookup,
        signal: AbortSignal.timeout(remaining),
        headers: { Accept: 'application/pgp-keys, application/octet-stream, text/plain, application/jose', 'Accept-Encoding': 'identity' }
      }, response => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
          response.destroy()
          if (!response.headers.location) return reject(new Error('Invalid profile redirect'))
          resolve({ location: response.headers.location })
          return
        }
        if (response.statusCode !== 200 || (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity')) {
          response.destroy()
          reject(new Error('Profile source returned an unsupported response'))
          return
        }
        const chunks = []
        let size = 0
        response.on('data', chunk => {
          size += chunk.length
          if (size > maxBytes) {
            response.destroy(new Error('Profile response exceeds size limit'))
            return
          }
          chunks.push(chunk)
        })
        response.on('end', () => resolve({ bytes: Buffer.concat(chunks) }))
        response.on('error', reject)
      })
      request.on('error', reject)
    })
    if (result.bytes) return result.bytes
    url = publicURL(new URL(result.location, url).href)
  }
  throw new Error('Too many profile redirects')
}
