import { defineConfig } from 'vite'
import path from 'node:path'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'

/*
 * Centrifugo is behind the same proxy as the app in production, so `connect-src
 * 'self'` covers the websocket and nothing has to be widened. Development and the
 * browser suite run it on a port of its own, and a policy baked at build time
 * cannot learn that at runtime — so the build that is going to be run that way
 * says so, and no other build carries the allowance.
 */
const realtimeOrigin = process.env.REALTIME_ORIGIN?.trim()
const connectSrc = ["'self'", realtimeOrigin].filter(Boolean).join(' ')

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: { port: 3000 },
  plugins: [
    tanstackStart(),
    nitro({
      routeRules: {
        '/**': {
          headers: {
            'Content-Security-Policy': `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src ${connectSrc}; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`,
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
})
