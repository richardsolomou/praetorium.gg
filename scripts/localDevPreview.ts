import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

const port = z.number().int().min(1).max(65_535)
export const localDevPreviewSchema = z.object({
  pid: z.number().int().positive(),
  token: z.uuid(),
  worktree: z.string(),
  mode: z.literal('dev'),
  ready: z.boolean(),
  appPort: port,
  internalPort: port,
  spacetimePort: port,
  controlPort: port,
  database: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  dataDir: z.string(),
  catalogueDir: z.string(),
  publicUrl: z.url(),
})
export type LocalDevPreview = z.infer<typeof localDevPreviewSchema>

export function localControlPort(worktree: string) {
  return 20_000 + (createHash('sha256').update(worktree).digest().readUInt16BE(0) % 20_000)
}

export function readLocalDevPreview(file: string): LocalDevPreview | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'))
    const legacy = localDevPreviewSchema
      .pick({ pid: true, appPort: true, spacetimePort: true, dataDir: true, catalogueDir: true, publicUrl: true })
      .safeParse(value)
    if (legacy.success && value && typeof value === 'object' && !('token' in value)) {
      try {
        process.kill(legacy.data.pid, 0)
        throw new Error('Stop the older development runner in its owning terminal before starting just dev')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
      }
      const worktree = path.dirname(path.dirname(path.resolve(file)))
      return localDevPreviewSchema.parse({
        ...legacy.data,
        token: randomUUID(),
        worktree,
        mode: 'dev',
        ready: false,
        internalPort: legacy.data.appPort + 1,
        controlPort: localControlPort(worktree),
        database: `praetorium-local-${legacy.data.appPort}`,
      })
    }
    return localDevPreviewSchema.parse(value)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw new Error(`Invalid local preview record: ${file}. Stop an older runner in its owning terminal before starting just dev.`, {
      cause: error,
    })
  }
}

export async function inspectLocalDevPreview(worktree: string, controlPort: number, token?: string) {
  let response: Response
  try {
    response = await fetch(`http://127.0.0.1:${controlPort}/status`, { signal: AbortSignal.timeout(1_000) })
  } catch {
    return undefined
  }
  if (response.status === 503) return undefined
  const result = localDevPreviewSchema.safeParse(await response.json().catch(() => null))
  if (!response.ok || !result.success || result.data.worktree !== worktree || (token && result.data.token !== token)) {
    throw new Error(`Port ${controlPort} is not owned by this worktree's development runner`)
  }
  return result.data
}

export function assertPreviewOverrides(preview: LocalDevPreview, environment: NodeJS.ProcessEnv) {
  const expected = {
    LOCAL_APP_PORT: String(preview.appPort),
    LOCAL_INTERNAL_PORT: String(preview.internalPort),
    LOCAL_SPACETIME_PORT: String(preview.spacetimePort),
    LOCAL_CONTROL_PORT: String(preview.controlPort),
    LOCAL_DATA_DIR: preview.dataDir,
    CATALOGUE_DIR: preview.catalogueDir,
    LOCAL_PUBLIC_URL: preview.publicUrl,
  }
  for (const [name, value] of Object.entries(expected)) {
    if (environment[name] !== undefined && environment[name] !== value) {
      throw new Error(`${name} differs from the running preview. Use just dev-restart to apply it.`)
    }
  }
}

export function assertSavedDevData(preview: LocalDevPreview, next: Pick<LocalDevPreview, 'dataDir' | 'appPort' | 'publicUrl'>) {
  if (next.dataDir === preview.dataDir && (next.appPort !== preview.appPort || next.publicUrl !== preview.publicUrl)) {
    throw new Error(
      `Saved development authentication is bound to ${preview.publicUrl}. Keep its app port and public URL, or set LOCAL_DATA_DIR to a fresh directory inside this worktree.`,
    )
  }
}
