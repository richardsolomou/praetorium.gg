import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { persistedSecret } from 'ras-stack/auth'
import { runRealtimeStack } from 'ras-stack/runtime'
// From the config module rather than the client: this file is bundled to ESM by
// esbuild, which `iovalkey` does not survive.
import { valkeyUrl } from '../src/adapters/valkeyConfig'

const secretFile = process.env.REALTIME_SECRET_FILE?.trim() || '/data/realtime-secret'
const secret = persistedSecret({
  directory: path.dirname(secretFile),
  filename: path.basename(secretFile),
  environmentKey: 'REALTIME_SECRET',
  bytes: 48,
})
process.env.REALTIME_SECRET = secret

// A preview owns a database on a Postgres it shares with other previews, and the
// database outlives the container, so it is emptied before anything migrates into it.
if (process.env.PRAETORIUM_PREVIEW_ADMIN_DATABASE_URL?.trim()) {
  execFileSync(process.execPath, ['.output/server/preview-database.mjs'], { stdio: 'inherit' })
}

// Before the app, never alongside it: a replica must not answer a request against
// a schema that is still moving. An advisory lock inside makes replicas starting
// together take turns rather than race.
execFileSync(process.execPath, ['.output/server/migrate.mjs'], { stdio: 'inherit' })

if (process.env.PRAETORIUM_SEED_PREVIEW === 'true' || previewDeployment(process.env.APP_URL)) {
  execFileSync(process.execPath, ['.output/server/seed-preview.mjs'], { stdio: 'inherit' })
}

process.exitCode = await runRealtimeStack({
  app: { command: process.execPath, args: ['.output/server/index.mjs'], env: { ...process.env, PORT: '3001' } },
  centrifugo: {
    configPath: '/app/realtime.json',
    env: {
      ...process.env,
    },
    environment: {
      apiKey: process.env.REALTIME_API_KEY?.trim() || secret,
      clientTokenSecret: secret,
      subscriptionTokenSecret: secret,
      /*
       * With Valkey, Centrifugo fans out through it instead of within one
       * process, which is the whole reason a second replica can exist: a command
       * published by the replica that took it reaches a page connected to another.
       * Without it Centrifugo keeps its own in-memory engine and one replica is
       * still the limit.
       */
      redisUrl: valkeyUrl(),
    },
  },
  caddy: { configPath: '/tmp/praetorium-Caddyfile', env: process.env },
})

function previewDeployment(value: string | undefined) {
  if (!value) return false
  try {
    return /^pr-\d+\.praetorium\.gg$/.test(new URL(value).hostname)
  } catch {
    return false
  }
}
