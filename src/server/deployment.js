// SPDX-License-Identifier: AGPL-3.0-or-later
import ipaddr from 'ipaddr.js'
import { isIP } from 'node:net'
import { rateLimit } from 'express-rate-limit'

export function trustedProxy (value = '') {
  if (!value) return () => false
  const entries = value.split(',').map(ip => ip.trim())
  if (entries.length > 8 || entries.some(ip => !isIP(ip))) {
    throw new Error('TRUST_PROXY_IPS requires at most eight literal proxy IP addresses')
  }
  const trusted = new Set(entries.map(ip => ipaddr.process(ip).toNormalizedString()))
  return ip => {
    try { return trusted.has(ipaddr.process(ip).toNormalizedString()) } catch { return false }
  }
}

export function configureDeployment (app, env, release) {
  app.set('trust proxy', trustedProxy(env.TRUST_PROXY_IPS))
  const limit = Number(env.RATE_LIMIT_MAX || 60)
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000) throw new Error('Invalid RATE_LIMIT_MAX')
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Content-Security-Policy', "object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
    next()
  })
  // Health polling must not exhaust a client's quota or fail under load.
  app.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok', ...release }))
  app.use(rateLimit({ windowMs: 60000, limit, standardHeaders: 'draft-7', legacyHeaders: false }))
}
