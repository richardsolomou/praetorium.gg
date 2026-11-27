import { createFileRoute } from '@tanstack/react-router'
import importMap from 'virtual:chunk-import-map'
import { version } from '../../../package.json'
import { deviceEngineFile } from '../../shared/deviceEngine'

export const Route = createFileRoute('/api/release')({
  server: {
    handlers: {
      GET: () => Response.json({ version, deviceEngine: deviceEngineFile(importMap) }, { headers: { 'cache-control': 'no-store' } }),
    },
  },
})
