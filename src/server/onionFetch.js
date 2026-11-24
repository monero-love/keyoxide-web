// SPDX-License-Identifier: AGPL-3.0-or-later
import http from 'node:http'
import https from 'node:https'
import { createHash } from 'node:crypto'
import { SocksProxyAgent } from 'socks-proxy-agent'
import { parseOnionClaim } from '../shared/onion.js'

export function validateOnionClaim (uri) {
  const parsed = parseOnionClaim(uri)
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567'
  let bits = ''
  for (const c of parsed.hostname.slice(0, 56)) bits += alphabet.indexOf(c).toString(2).padStart(5, '0')
  const bytes = Buffer.from(bits.match(/.{8}/g).map(byte => Number.parseInt(byte, 2)))
  const checksum = createHash('sha3-256').update(Buffer.concat([
    Buffer.from('.onion checksum'), bytes.subarray(0, 32), Buffer.from([3])
  ])).digest().subarray(0, 2)
  if (bytes[34] !== 3 || !checksum.equals(bytes.subarray(32, 34))) throw new Error('Invalid v3 onion address')
  return parsed
}

export async function fetchOnionProof (uri, { port = 9050, timeout = 20000, maxBytes = 65536 } = {}) {
  const parsed = validateOnionClaim(uri)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid Tor port')
  // socks5h delegates the hostname to Tor. Never resolve .onion via local DNS.
  const agent = new SocksProxyAgent(`socks5h://127.0.0.1:${port}`, { timeout })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    return await new Promise((resolve, reject) => {
      const client = parsed.protocol === 'https' ? https : http
      const request = client.get(uri, {
        agent,
        signal: controller.signal,
        headers: { Accept: 'text/plain', 'Accept-Encoding': 'identity', 'User-Agent': 'KeyoxideOnionProof/1' }
      }, response => {
        // No redirects, compression, HTML, credentials, cookies or TLS bypass.
        if (response.statusCode !== 200 ||
            !/^text\/plain(?:\s*;\s*charset=utf-8)?$/i.test(response.headers['content-type'] || '') ||
            (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') ||
            Number(response.headers['content-length'] || 0) > maxBytes) {
          response.destroy()
          reject(new Error('Invalid onion proof response'))
          return
        }
        let size = 0
        const chunks = []
        response.on('data', chunk => {
          size += chunk.length
          if (size > maxBytes) response.destroy(new Error('Onion proof too large'))
          else chunks.push(chunk)
        })
        response.on('error', reject)
        response.on('end', () => {
          try { resolve(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))) } catch (error) { reject(error) }
        })
      })
      request.on('error', reject)
    })
  } finally {
    clearTimeout(timer)
    agent.destroy()
  }
}
