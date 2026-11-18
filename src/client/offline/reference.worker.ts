import '../polyfills'
import { MAX_REFERENCE_PART_BYTES, queryIndex } from '../../contracts/offlineReference'
import { readPart } from './referenceStore'

/** `asset` is absolute, because an inline worker resolves relative addresses against its `blob:` URL. */
export type ReferenceWorkerRequest = { id: number; asset: string; key: string; network: boolean }
export type ReferenceWorkerAnswer = { id: number; value?: unknown; error?: string }

/** Parts decoded last, least recently read first; pages read a handful at a time. */
const parts = new Map<string, Promise<Map<string, unknown>>>()
const MAX_PARTS = 6

function part(asset: string, network: boolean) {
  let decoded = parts.get(asset)
  if (decoded) parts.delete(asset)
  else {
    decoded = readPart(asset, MAX_REFERENCE_PART_BYTES, network).then(queryIndex)
    decoded.catch(() => parts.get(asset) === decoded && parts.delete(asset))
  }
  parts.set(asset, decoded)
  for (const oldest of parts.keys()) {
    if (parts.size <= MAX_PARTS) break
    parts.delete(oldest)
  }
  return decoded
}

self.onmessage = ({ data: { id, asset, key, network } }: MessageEvent<ReferenceWorkerRequest>) => {
  part(asset, network).then(
    (index) => self.postMessage({ id, value: index.get(key) } satisfies ReferenceWorkerAnswer),
    (error: unknown) =>
      self.postMessage({ id, error: error instanceof Error ? error.message : String(error) } satisfies ReferenceWorkerAnswer),
  )
}
