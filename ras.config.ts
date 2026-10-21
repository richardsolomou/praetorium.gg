import {
  defineConfig,
  tanstackStart,
  spacetimeDB,
  betterAuth,
  libsql,
  email,
  posthog,
  typescript,
  oxlint,
  oxfmt,
  vite,
  vitest,
  playwright,
} from 'ras-stack/config'

export default defineConfig({
  integrations: [tanstackStart, spacetimeDB, betterAuth, libsql, email, posthog.react, posthog.server],
  tooling: [typescript.tanstack, oxlint.application, oxlint.tanstack, oxlint.domain, oxlint.layers, oxfmt, vite, vitest, playwright],
})
