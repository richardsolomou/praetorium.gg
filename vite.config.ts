import { defineConfig, loadEnv } from 'vite'
import path from 'node:path'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { postHogEnvironment } from 'ras-stack/posthog'
import { postHogIngestProxy } from 'ras-stack/posthog/proxy'
import { POSTHOG_INGEST_PATH } from './src/posthog'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const posthog = postHogEnvironment({ projectToken: env.VITE_POSTHOG_PROJECT_TOKEN, host: env.VITE_POSTHOG_HOST })
  const proxy = posthog ? postHogIngestProxy(posthog, { path: POSTHOG_INGEST_PATH }) : undefined
  return {
    resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
    // Centrifugo runs beside the dev server rather than behind Caddy, so the proxy
    // is what keeps the browser on one origin — the same origin it has in
    // production, which is why the content policy needs no exception anywhere.
    server: { port: 3000, proxy: { '/connection': { target: 'http://127.0.0.1:8000', ws: true }, ...proxy?.vite } },
    plugins: [
      tanstackStart(),
      nitro({
        routeRules: {
          ...proxy?.nitro,
          '/**': {
            headers: {
              'Content-Security-Policy':
                "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://cdn.jsdelivr.net; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
              'Referrer-Policy': 'no-referrer',
              'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
              'X-Content-Type-Options': 'nosniff',
              'X-Frame-Options': 'DENY',
            },
          },
        },
      }),
      viteReact(),
      tailwindcss(),
    ],
  }
})
