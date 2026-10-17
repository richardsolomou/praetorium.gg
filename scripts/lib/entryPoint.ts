import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** `import.meta.main` is undefined under tsx, so compare the resolved script path instead. */
export function isEntryPoint(moduleUrl: string) {
  const script = process.argv[1]
  return script !== undefined && realpathSync(script) === fileURLToPath(moduleUrl)
}
