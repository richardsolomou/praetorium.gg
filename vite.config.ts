import { offlineAppPlugin } from './scripts/lib/offlineAppPlugin.ts'
import { defineConfig, loadEnv } from 'vite'
import path from 'node:path'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { postHogEnvironment } from 'ras-stack/posthog'
import { postHogIngestProxy } from 'ras-stack/posthog/proxy'
import posthogRollup from '@posthog/rollup-plugin'

export function webSourceMapPlugins(env: NodeJS.ProcessEnv) {
  if (env.POSTHOG_UPLOAD_SOURCEMAPS !== 'true') return []
  return [
    posthogRollup({
      personalApiKey: env.POSTHOG_CLI_API_KEY!,
      projectId: env.POSTHOG_CLI_PROJECT_ID,
      host: env.POSTHOG_CLI_HOST,
      sourcemaps: {
        releaseName: 'praetorium-web',
        releaseVersion: env.GITHUB_SHA,
        releaseMode: 'symbol-set',
        deleteAfterUpload: true,
      },
    }),
  ]
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  process.env = { ...env, ...process.env }
  const posthog = postHogEnvironment({ projectToken: env.VITE_POSTHOG_PROJECT_TOKEN, host: env.VITE_POSTHOG_HOST })
  const proxy = posthog ? postHogIngestProxy(posthog) : undefined
  return {
    ...(process.env.LOCAL_BUILD_DIR ? { cacheDir: path.join(process.env.LOCAL_BUILD_DIR, 'vite-cache') } : {}),
    resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
    // The Node preview renderer inlines its WebAssembly, which only an asset type accepts.
    assetsInclude: ['**/*.wasm'],
    build: {
      sourcemap: 'hidden',
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'telemetry',
                test: (id) => id.includes('posthog-js') || id.includes('@posthog') || /ras-stack.*posthog/.test(id),
              },
            ],
          },
        },
      },
    },
    worker: { plugins: () => webSourceMapPlugins(env) },
    server: {
      port: 3000,
      strictPort: true,
      proxy: proxy?.vite,
      ...(process.env.LOCAL_VITE_ORIGIN ? { ws: { clientPort: Number(process.env.LOCAL_APP_PORT ?? 3000) } } : {}),
    },
    plugins: [
      tanstackStart({ serverFns: { disableCsrfMiddlewareWarning: true } }),
      nitro({
        ...(process.env.LOCAL_BUILD_DIR
          ? {
              buildDir: path.join(process.env.LOCAL_BUILD_DIR, 'nitro'),
              output: {
                dir: process.env.LOCAL_BUILD_DIR,
                serverDir: path.join(process.env.LOCAL_BUILD_DIR, 'server'),
                publicDir: path.join(process.env.LOCAL_BUILD_DIR, 'public'),
              },
            }
          : {}),
        plugins: [
          path.resolve(import.meta.dirname, 'src/server/warmPlugin.ts'),
          path.resolve(import.meta.dirname, 'src/server/cspPlugin.ts'),
        ],
        routeRules: {
          ...proxy?.nitro,
          '/**': {
            headers: {
              // img-src widens further at runtime, in cspPlugin.ts: this base list is
              // baked in at build time, but where pictures are served from is a
              // per-deployment, runtime setting.
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
      offlineAppPlugin(),
      tailwindcss(),
      ...webSourceMapPlugins(env).map((plugin) => ({
        ...plugin,
        applyToEnvironment: (environment: { name: string }) => environment.name === 'client',
      })),
    ],
  }
})
