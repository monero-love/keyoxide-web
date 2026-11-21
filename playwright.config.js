// SPDX-License-Identifier: AGPL-3.0-or-later
import {defineConfig,devices} from '@playwright/test'
export default defineConfig({
  testDir:'./test/e2e', workers:1, retries:0,
  reporter:'list', outputDir:'test-results/browser',
  use:{baseURL:'http://127.0.0.1:3337',trace:'off',screenshot:'off',video:'off'},
  projects:[{name:'chromium-desktop',use:{...devices['Desktop Chrome']}},{name:'chromium-mobile',use:{...devices['Pixel 7']}}],
  webServer:{command:'node scripts/simplex-preview.js',url:'http://127.0.0.1:3337',reuseExistingServer:false,env:{PREVIEW_PORT:'3337'},timeout:30000}
})
