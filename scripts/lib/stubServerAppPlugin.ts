import path from 'node:path'
import type { Plugin } from 'vite'

const serverApp = path.resolve(import.meta.dirname, '../../src/server/app.ts')
const stub = path.resolve(import.meta.dirname, 'serverAppStub.ts')

/**
 * Resolves `src/server/app.ts` to a stub that throws when called. Client tests reach it only through server-function
 * modules, which the TanStack Start compiler strips from the real client build, and importing it costs each test file
 * better-auth and sqlite.
 */
export function stubServerAppPlugin(): Plugin {
  return {
    name: 'stub-server-app',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !/(^|\/)app(\.[jt]s)?$/.test(source)) return null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      return resolved?.id === serverApp ? stub : null
    },
  }
}
