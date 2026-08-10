import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { persistedSecret } from 'ras-stack/auth'
import { caddyRealtimeProxy, caddyRuntimeEnvironment, centrifugoEnvironment, superviseProcesses } from 'ras-stack/runtime'

const secretFile = process.env.REALTIME_SECRET_FILE?.trim() || '/data/realtime-secret'
const secret = persistedSecret({
  directory: path.dirname(secretFile),
  filename: path.basename(secretFile),
  environmentKey: 'REALTIME_SECRET',
  bytes: 48,
})
process.env.REALTIME_SECRET = secret

if (process.env.PRAETORIUM_SEED_PREVIEW === 'true' || previewDeployment(process.env.APP_URL)) {
  execFileSync(process.execPath, ['.output/server/seed-preview.mjs'], { stdio: 'inherit' })
}

const caddyfile = '/tmp/praetorium-Caddyfile'
fs.writeFileSync(caddyfile, caddyRealtimeProxy())
const status = await superviseProcesses([
  {
    name: 'realtime',
    command: 'centrifugo',
    args: ['--config=/app/realtime.json'],
    env: {
      ...process.env,
      ...centrifugoEnvironment({
        apiKey: process.env.REALTIME_API_KEY?.trim() || secret,
        clientTokenSecret: secret,
        subscriptionTokenSecret: secret,
      }),
    },
  },
  { name: 'app', command: process.execPath, args: ['.output/server/index.mjs'], env: { ...process.env, PORT: '3001' } },
  {
    name: 'proxy',
    command: 'caddy',
    args: ['run', '--config', caddyfile, '--adapter', 'caddyfile'],
    env: { ...process.env, ...caddyRuntimeEnvironment() },
  },
])
process.exitCode = status

function previewDeployment(value: string | undefined) {
  if (!value) return false
  try {
    return /^pr-\d+\.praetorium\.gg$/.test(new URL(value).hostname)
  } catch {
    return false
  }
}
