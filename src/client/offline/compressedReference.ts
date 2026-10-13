import { gunzipSync, strFromU8, strToU8 } from 'fflate'
import { MAX_OFFLINE_BYTES, isReferenceBundle, type OfflineReferenceData } from '../../contracts/offlineReference'

export type CompressedReference = { encoding: 'gzip-base64'; data: string }

export async function compressReference(data: OfflineReferenceData, signal?: AbortSignal): Promise<CompressedReference> {
  signal?.throwIfAborted()
  const blob = new Blob([JSON.stringify(data)])
  if (blob.size > MAX_OFFLINE_BYTES) throw new Error('The reference exceeds this device’s download limit.')
  const compressed = blob.stream().pipeThrough(new CompressionStream('gzip'), { signal })
  const bytes = new Uint8Array(await new Response(compressed).arrayBuffer())
  return { encoding: 'gzip-base64', data: btoa(strFromU8(bytes, true)) }
}

export function decompressReference(value: unknown): OfflineReferenceData | null {
  try {
    const packed = value as CompressedReference | null
    if (packed?.encoding !== 'gzip-base64' || typeof packed.data !== 'string' || packed.data.length > MAX_OFFLINE_BYTES) return null
    const bytes = strToU8(atob(packed.data), true)
    if (bytes.length < 18) return null
    const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(bytes.length - 4, true)
    if (size > MAX_OFFLINE_BYTES) return null
    const data: unknown = JSON.parse(strFromU8(gunzipSync(bytes, { out: new Uint8Array(size) })))
    return isReferenceBundle(data) && Number.isFinite((data as OfflineReferenceData).savedAt) ? (data as OfflineReferenceData) : null
  } catch {
    return null
  }
}
