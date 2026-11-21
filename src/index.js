/*
Copyright (C) 2021 Yarmo Mackenbach

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License as published by the Free
Software Foundation, either version 3 of the License, or (at your option)
any later version.

This program is distributed in the hope that it will be useful, but WITHOUT
ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
details.

You should have received a copy of the GNU Affero General Public License along
with this program. If not, see <https://www.gnu.org/licenses/>.

Also add information on how to contact you by electronic and paper mail.

If your software can interact with users remotely through a computer network,
you should also make sure that it provides a way for users to get its source.
For example, if your program is a web application, its interface could display
a "Source" link that leads users to an archive of the code. There are many
ways you could offer source, and different solutions will be better for different
programs; see section 13 for the specific requirements.

You should also get your employer (if you work as a programmer) or school,
if any, to sign a "copyright disclaimer" for the program, if necessary. For
more information on this, and how to apply and follow the GNU AGPL, see <https://www.gnu.org/licenses/>.
*/
import express from 'express'
import * as httpContext from 'express-http-context2'
import { nanoid } from 'nanoid'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { configureDeployment } from './server/deployment.js'
import { stringReplace } from 'string-replace-middleware'
import * as pug from 'pug'
import * as dotenv from 'dotenv'

import logger from './log.js'
import apiRoute from './routes/api.js'
import mainRoute from './routes/main.js'
import profileRoute from './routes/profile.js'
import staticRoute from './routes/static.js'
import utilRoute from './routes/util.js'
dotenv.config()

// Get information about the last git commit
let gitBranch = process.env.CI_COMMIT_BRANCH ?? process.env.COMMIT_BRANCH
if (!gitBranch && process.env.NODE_ENV !== 'production') {
  try {
    gitBranch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim()
  } catch (_err) {
    logger.debug('Could not get git branch',
      { component: 'http_server', action: 'init' })
  }
}
let gitHash = process.env.CI_COMMIT_SHA ?? process.env.COMMIT_SHA
if (!gitHash && process.env.NODE_ENV !== 'production') {
  try {
    gitHash = execSync('git rev-parse HEAD').toString().trim()
  } catch (_err) {
    logger.debug('Could not get git hash',
      { component: 'http_server', action: 'init' })
  }
}

if (process.env.NODE_ENV === 'production' &&
    (process.env.ENABLE_PROXY_MODULE === 'true' || process.env.ENABLE_SERVER_VERIFICATION === 'true')) {
  throw new Error('Unrestricted legacy network modules are not supported by this production release')
}
const app = express()
const packageData = JSON.parse(readFileSync('./package.json'))

app.disable('x-powered-by')
app.set('query parser', 'simple')
app.set('env', process.env.NODE_ENV || 'production')
app.engine('pug', pug.__express).set('view engine', 'pug')
app.set('port', process.env.PORT || 3000)
app.set('domain', process.env.DOMAIN)
app.set('scheme', process.env.SCHEME || 'https')
app.set('keyoxide_name', 'keyoxide-web')
app.set('keyoxide_version', packageData.version)
app.set('git_branch', gitBranch)
app.set('git_hash', gitHash)
app.set('onion_url', process.env.ONION_URL)
app.set('enable_analytics', process.env.ENABLE_ANALYTICS === 'true' && process.env.DOMAIN === 'keyoxide.net' && process.env.SCHEME !== 'http')
app.set('discovery_profile', process.env.DISCOVERY_PROFILE || 'instances@keyoxide.org')

// Middlewares
configureDeployment(app, process.env, { version: packageData.version, revision: gitHash || null })
app.get('/source.tar.gz', (_req, res) => res.sendFile(resolve('source.tar.gz')))
app.use(httpContext.middleware)
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'interest-cohort=()')
  httpContext.set('requestId', nanoid())
  httpContext.set('requestPath', req.path)
  httpContext.set('requestIp', req.ip)

  logger.info('Handle a request',
    { component: 'http_server', action: 'request' })

  next()
})

if (app.get('onion_url')) {
  app.get('/*', (req, res, next) => {
    res.header('Onion-Location', app.get('onion_url'))
    next()
  })
}

app.use(stringReplace({
  PLACEHOLDER__PROXY_HOSTNAME: process.env.PROXY_HOSTNAME || process.env.DOMAIN || 'null',
  PLACEHOLDER__PROXY_SCHEME: process.env.PROXY_SCHEME || process.env.SCHEME || 'https'
}, {
  contentTypeFilterRegexp: /application\/javascript/
}))

// Routes
app.use('/api', apiRoute)
if ((process.env.ENABLE_MAIN_MODULE ?? 'true') === 'true') {
  app.use('/favicon.svg', express.static('./static/favicon.svg'))
  app.use('/robots.txt', express.static('./static/robots.txt'))

  app.use('/', mainRoute)
  app.use('/static', staticRoute)
  app.use('/util', utilRoute)
  app.use('/', profileRoute)
}

const server = app.listen(app.get('port'), process.env.HOST || '127.0.0.1', () => {
  logger.info(`Server listening at http://localhost:${app.get('port')}`,
    { component: 'http_server', action: 'start' })
})

server.requestTimeout = 15000
server.headersTimeout = 10000
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(1), 10000).unref()
  })
}

export default app
