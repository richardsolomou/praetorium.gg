import {
  defineConfig,
  tanstackStart,
  betterAuth,
  libsql,
  email,
  posthog,
  typescript,
  oxlint,
  oxfmt,
  tailwind,
  nitro,
  vite,
  vitest,
  playwright,
} from 'ras-stack/config'

export default defineConfig({
  integrations: [tanstackStart, betterAuth, libsql, email, posthog.react, posthog.server],
  tooling: [typescript, oxlint.domain, oxlint.layers, oxfmt, tailwind, nitro, posthog.build, vite, vitest, playwright],
})
