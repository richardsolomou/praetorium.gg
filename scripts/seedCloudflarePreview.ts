import { drizzle } from 'drizzle-orm/d1'
import { getPlatformProxy } from 'wrangler'
import { seedPreview } from './seedPreview'

const configPath = process.env.PREVIEW_WRANGLER_CONFIG
if (!configPath) throw new Error('PREVIEW_WRANGLER_CONFIG is required')

const proxy = await getPlatformProxy<{ AUTH_DB: Parameters<typeof drizzle>[0] }>({
  configPath,
  envFiles: [],
  persist: false,
  remoteBindings: true,
})
try {
  await seedPreview(undefined, undefined, proxy.env.AUTH_DB)
} finally {
  await proxy.dispose()
}
