import { offlineAppPlugin } from './scripts/lib/offlineAppPlugin.ts'
import { recentChangelogPlugin } from './scripts/lib/recentChangelogPlugin.ts'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig, loadEnv, type UserConfig } from 'vite'
import path from 'node:path'
import { postHogSourceMaps } from './scripts/posthogSourceMaps.ts'
export default defineConfig(({ mode }): UserConfig => {
  const env = loadEnv(mode, process.cwd(), '')
  process.env = { ...env, ...process.env }
  return {
    ...(process.env.LOCAL_BUILD_DIR ? { cacheDir: path.join(process.env.LOCAL_BUILD_DIR, 'vite-cache') } : {}),
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
                test: (id) => id.includes('posthog-js') || id.includes('@posthog'),
              },
            ],
          },
        },
      },
    },
    // TanStack Start keeps better-auth out of pre-bundling, so without this
    // the browser meets its imports only on first load and Vite reloads the page for them.
    optimizeDeps: { include: ['better-auth > jose/errors'] },
    server: {
      port: 3000,
      strictPort: true,
      ...(process.env.LOCAL_VITE_ORIGIN ? { ws: { clientPort: Number(process.env.LOCAL_APP_PORT ?? 3000) } } : {}),
    },
    resolve: { alias: { '@': path.join(import.meta.dirname, 'src') } },
    plugins: [
      tanstackStart(),
      nitro({
        preset: 'node-server',
        // The server bundle inlines React Query, whose `'use client'` directives mean nothing on the server.
        rolldownConfig: { checks: { moduleLevelDirective: false } },
        ...(process.env.LOCAL_BUILD_DIR
          ? {
              // Coverage runs map executed server code back to source to choose which specs a change needs.
              sourcemap: true,
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
          path.resolve(import.meta.dirname, 'src/server/shutdown.ts'),
        ],
        routeRules: {
          '/reference-worker.js': { headers: { 'Cache-Control': 'no-store' } },
          '/notice-worker.js': { headers: { 'Cache-Control': 'no-store' } },
          '/offline-app-version.json': { headers: { 'Cache-Control': 'no-store' } },
          '/offline-reference-version.json': { headers: { 'Cache-Control': 'no-store' } },
        },
      }),
      viteReact(),
      tailwindcss(),
      postHogSourceMaps(process.env),
      recentChangelogPlugin(),
      offlineAppPlugin(),
    ],
  }
})
