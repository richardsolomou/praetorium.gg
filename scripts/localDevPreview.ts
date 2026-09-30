import { readFileSync } from 'node:fs'

export type LocalDevPreview = {
  pid: number
  appPort: number
  spacetimePort: number
  dataDir: string
  catalogueDir: string
  publicUrl: string
}

export function readLocalDevPreview(file: string): LocalDevPreview | undefined {
  let value: unknown
  try {
    value = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  if (
    !value ||
    typeof value !== 'object' ||
    !Number.isSafeInteger((value as LocalDevPreview).pid) ||
    (value as LocalDevPreview).pid < 1 ||
    !Number.isInteger((value as LocalDevPreview).appPort) ||
    (value as LocalDevPreview).appPort < 1 ||
    (value as LocalDevPreview).appPort > 65_535 ||
    !Number.isInteger((value as LocalDevPreview).spacetimePort) ||
    (value as LocalDevPreview).spacetimePort < 1 ||
    (value as LocalDevPreview).spacetimePort > 65_535 ||
    typeof (value as LocalDevPreview).dataDir !== 'string' ||
    typeof (value as LocalDevPreview).catalogueDir !== 'string' ||
    typeof (value as LocalDevPreview).publicUrl !== 'string'
  )
    throw new Error(`Invalid local preview record: ${file}`)
  return value as LocalDevPreview
}

export async function reuseLocalDevPreview(preview: LocalDevPreview) {
  for (let attempt = 0; attempt < 240; attempt++) {
    try {
      process.kill(preview.pid, 0)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
      throw error
    }
    try {
      const response = await fetch(`http://127.0.0.1:${preview.appPort}/api/health`, { signal: AbortSignal.timeout(500) })
      if (response.ok) return true
    } catch {
      // The existing preview may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Local preview process ${preview.pid} is running but port ${preview.appPort} did not become healthy`)
}
