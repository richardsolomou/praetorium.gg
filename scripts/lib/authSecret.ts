import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function existingAuthSecret(environment: NodeJS.ProcessEnv = process.env): Promise<string> {
  const configured = environment.AUTH_SECRET?.trim()
  if (configured) return configured
  const file = join(environment.DATA_DIR ?? '/data', 'auth.secret')
  const stored = (await readFile(file, 'utf8')).trim()
  if (!stored) throw new Error(`Auth secret is empty: ${file}`)
  return stored
}
