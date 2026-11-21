// SPDX-License-Identifier: AGPL-3.0-or-later
import express from 'express'
import { Resolver } from 'node:dns/promises'
import { fetchPublicBytes } from '../../server/publicFetch.js'
import { isSimplexClaim } from '../../shared/simplex.js'

export function publicProofRouter ({ fetchBytes = fetchPublicBytes, resolverFactory = () => new Resolver({ timeout: 1500, tries: 1 }) } = {}) {
  const router = express.Router()
  let pending = 0
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    if (pending >= 8) return res.status(503).json({ errors: ['Public proof fetch capacity reached'] })
    next()
  })
  router.get('/http', async (req, res) => {
    if (typeof req.query.url !== 'string' || req.query.url.length > 8192 ||
        isSimplexClaim(req.query.url) || !['json', 'text'].includes(req.query.format)) {
      return res.status(400).json({ errors: ['Invalid public proof request'] })
    }
    pending++
    try {
      const bytes = await fetchBytes(req.query.url, { timeout: 5000, maxBytes: 1024 * 1024 })
      if (req.query.format === 'json') return res.json(JSON.parse(bytes.toString('utf8')))
      return res.type('text/plain').send(bytes.toString('utf8'))
    } catch {
      return res.status(400).json({ errors: ['Public proof could not be fetched'] })
    } finally { pending-- }
  })
  router.get('/dns', async (req, res) => {
    const domain = req.query.domain
    if (typeof domain !== 'string' || domain.length > 253 ||
        !/^(?:[a-zA-Z0-9_](?:[a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?\.)+[a-zA-Z]{2,63}$/.test(domain) ||
        /(?:^|\.)(?:localhost|local|internal|test|invalid)$/i.test(domain)) {
      return res.status(400).json({ errors: ['Invalid public DNS name'] })
    }
    pending++
    const resolver = resolverFactory()
    // Never expose host/VPN/split-horizon DNS via the public proof endpoint.
    resolver.setServers(['1.1.1.1', '1.0.0.1'])
    const timer = setTimeout(() => resolver.cancel(), 4000)
    try {
      const records = await resolver.resolveTxt(domain)
      if (Buffer.byteLength(JSON.stringify(records)) > 65536) throw new Error('Oversized TXT answer')
      return res.json({ domain, records: { txt: records } })
    } catch {
      return res.status(400).json({ errors: ['Public DNS proof could not be fetched'] })
    } finally { clearTimeout(timer); pending-- }
  })
  router.use((_req, res) => res.status(501).json({ errors: ['This proof transport is not supported by the restricted public proxy'] }))
  return router
}
