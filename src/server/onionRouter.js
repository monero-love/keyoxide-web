// SPDX-License-Identifier: AGPL-3.0-or-later
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import { fetchOnionProof, validateOnionClaim } from './onionFetch.js'

export function onionRouter ({ enabled = false, port = 9050, fetchProof = fetchOnionProof } = {}) {
  const router = express.Router()
  let pending = 0
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  router.use(rateLimit({ windowMs: 60000, limit: 6, standardHeaders: 'draft-7', legacyHeaders: false }))
  router.post('/check', express.json({ limit: '2kb' }), async (req, res) => {
    if (!enabled) return res.status(503).json({ error: 'Onion proof checks are not enabled on this instance.' })
    if (!req.is('application/json') || !req.body || Object.keys(req.body).join(',') !== 'url') {
      return res.status(400).json({ error: 'Supply only the onion proof URL.' })
    }
    try { validateOnionClaim(req.body.url) } catch {
      return res.status(400).json({ error: 'Use a valid v3 onion proof URL ending in /.well-known/keyoxide.txt.' })
    }
    if (pending >= 4) return res.status(503).json({ error: 'Onion proof checks are busy. Try again later.' })
    pending++
    try {
      const proof = await fetchProof(req.body.url, { port })
      return res.json({ url: req.body.url, proof })
    } catch {
      return res.status(502).json({ error: 'The onion proof could not be retrieved through Tor. No proof was verified.' })
    } finally { pending-- }
  })
  router.use((_req, res) => res.status(405).json({ error: 'Use an explicit POST to check an onion proof.' }))
  router.use((error, _req, res, _next) => res.status(error.status === 413 ? 413 : 400).json({ error: 'Invalid proof request.' }))
  return router
}
