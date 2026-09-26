import { execFileSync } from 'node:child_process'
import { persistedRealtimeSecret, runRealtimeStack } from 'ras-stack/runtime'
// From the config module rather than the client: this file is bundled to ESM by
// esbuild, which `iovalkey` does not survive.
import { valkeyUrl } from '../src/adapters/valkeyConfig'

const secret = persistedRealtimeSecret()

// Before the app, never alongside it: a replica must not answer a request against
// a schema that is still moving. An advisory lock inside makes replicas starting
// together take turns rather than race.
execFileSync(process.execPath, ['.output/server/migrate.mjs'], { stdio: 'inherit' })

if (process.env.PRAETORIUM_SEED_PREVIEW === 'true') {
  // Said out loud to the seeder, which refuses a database it was not sent at
  // deliberately: the accounts it creates sign in with passwords this repository prints.
  execFileSync(process.execPath, ['.output/server/seed-preview.mjs'], {
    stdio: 'inherit',
    env: { ...process.env, PRAETORIUM_SEED_PREVIEW: 'true' },
  })
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
