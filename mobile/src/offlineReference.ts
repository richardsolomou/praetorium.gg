import { MAX_OFFLINE_BYTES } from '../../src/contracts/offlineReference'
export type SavedReference = { html: string; savedAt: number }
export function parseSavedReference(value: unknown): SavedReference | null {
  if (!value || typeof value !== 'object') return null
  const pack = value as Record<string, unknown>
  if (
    typeof pack.html !== 'string' ||
    !pack.html.startsWith('<!doctype html>') ||
    !pack.html.includes('window.PraetoriumOffline=') ||
    new TextEncoder().encode(pack.html).byteLength > MAX_OFFLINE_BYTES ||
    typeof pack.savedAt !== 'number' ||
    !Number.isFinite(pack.savedAt)
  )
    return null
  return { html: pack.html, savedAt: pack.savedAt }
}
