import { gunzipSync, strFromU8, strToU8 } from 'fflate'
import { MAX_OFFLINE_BYTES, isReferenceBundle, type OfflineReferenceData } from '../../contracts/offlineReference'

/**
 * A saved reference, gzip-compressed and base64-encoded so it survives JSON. Construction data is packed
 * apart from the reference so restoring a page or search never decodes it, and each query stays serialized
 * so restoring parses only the pages a player opens.
 */
export type CompressedReference =
  | { encoding: 'gzip-base64'; data: string }
  | { encoding: 'gzip-base64-parts'; reference: string; construction?: string; serializedQueries?: true }

export type SerializedQuery = { key: readonly unknown[]; json: string }

const serializeQuery = (entry: OfflineReferenceData['queries'][number]): SerializedQuery => ({
  key: entry.key,
  json: JSON.stringify(entry.data),
})

const isSerializedQuery = (entry: unknown): entry is SerializedQuery =>
  Array.isArray((entry as SerializedQuery | null)?.key) && typeof (entry as SerializedQuery).json === 'string'

/** Query entries whose data is parsed the first time it is read. */
export function lazyQueries(queries: readonly SerializedQuery[]): OfflineReferenceData['queries'] {
  return queries.map(({ key, json }) => {
    let data: unknown
    let parsed = false
    return {
      key,
      get data() {
        if (!parsed) {
          data = JSON.parse(json)
          parsed = true
        }
        return data
      },
    }
  })
}

async function pack(value: unknown, signal?: AbortSignal) {
  signal?.throwIfAborted()
  const blob = new Blob([JSON.stringify(value)])
  if (blob.size > MAX_OFFLINE_BYTES) throw new Error('The reference exceeds this device’s download limit.')
  const compressed = blob.stream().pipeThrough(new CompressionStream('gzip'), { signal })
  const bytes = new Uint8Array(await new Response(compressed).arrayBuffer())
  return btoa(strFromU8(bytes, true))
}

export async function compressReference(data: OfflineReferenceData, signal?: AbortSignal): Promise<CompressedReference> {
  const { construction, ...reference } = data
  return {
    encoding: 'gzip-base64-parts',
    reference: await pack({ ...reference, queries: reference.queries.map(serializeQuery) }, signal),
    ...(construction ? { construction: await pack(construction, signal) } : {}),
    serializedQueries: true,
  }
}

function gzipped(data: unknown) {
  if (typeof data !== 'string' || data.length > MAX_OFFLINE_BYTES) return null
  const bytes = strToU8(atob(data), true)
  if (bytes.length < 18) return null
  const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(bytes.length - 4, true)
  return size > MAX_OFFLINE_BYTES ? null : { bytes, size }
}

function unpack(data: unknown): unknown {
  const packed = gzipped(data)
  return packed && JSON.parse(strFromU8(gunzipSync(packed.bytes, { out: new Uint8Array(packed.size) })))
}

/** Decompresses with the browser's native stream, off the main thread. */
async function unpackInBackground(data: unknown): Promise<unknown> {
  const packed = gzipped(data)
  return packed && new Response(new Response(packed.bytes).body!.pipeThrough(new DecompressionStream('gzip'))).json()
}

const isSavedReference = (data: unknown): data is OfflineReferenceData =>
  isReferenceBundle(data) && Number.isFinite((data as OfflineReferenceData).savedAt)

const isCompressedReference = (value: unknown): value is CompressedReference => {
  const encoding = (value as CompressedReference | null)?.encoding
  return encoding === 'gzip-base64' || encoding === 'gzip-base64-parts'
}

/** Attaches construction data that is decoded on first use: only offline roster construction needs it, and it is most of the download. */
export function withConstruction(data: OfflineReferenceData, packed: string) {
  let construction: OfflineReferenceData['construction'] | null = null
  const reference = { ...data }
  return Object.defineProperty(data, 'construction', {
    enumerable: true,
    get() {
      if (construction === null) {
        try {
          const unpacked = unpack(packed) as OfflineReferenceData['construction']
          construction = isReferenceBundle({ ...reference, construction: unpacked }) ? unpacked : undefined
        } catch {
          construction = undefined
        }
      }
      return construction
    },
  })
}

/** The queries of a saved reference as stored: serialized by current saves, parsed by older ones. */
function storedQueries(data: OfflineReferenceData, serialized: boolean): SerializedQuery[] | null {
  if (!serialized) return data.queries.map(serializeQuery)
  const queries: unknown[] = data.queries
  return queries.every(isSerializedQuery) ? queries : null
}

const servesSerializedQueries = (packed: CompressedReference) =>
  packed.encoding === 'gzip-base64-parts' && Boolean(packed.serializedQueries)

function assemble(packed: CompressedReference, data: unknown): OfflineReferenceData | null {
  if (packed.encoding === 'gzip-base64') return isSavedReference(data) ? data : null
  if (!isSavedReference(data) || 'construction' in data) return null
  let reference = data
  if (servesSerializedQueries(packed)) {
    const queries = storedQueries(data, true)
    if (!queries) return null
    reference = { ...data, queries: lazyQueries(queries) }
  }
  return packed.construction === undefined ? reference : withConstruction(reference, packed.construction)
}

export function decompressReference(value: unknown): OfflineReferenceData | null {
  try {
    return isCompressedReference(value) ? assemble(value, unpack(value.encoding === 'gzip-base64' ? value.data : value.reference)) : null
  } catch {
    return null
  }
}

/**
 * A saved reference with its queries serialized and its construction data still packed for `withConstruction`.
 * A reference saved before construction was packed apart, or saved uncompressed, is returned without it.
 */
export async function restoreReferenceParts(value: unknown): Promise<{
  reference: Omit<OfflineReferenceData, 'construction' | 'queries'>
  queries: SerializedQuery[]
  construction?: string
} | null> {
  try {
    const compressed = isCompressedReference(value)
    const data = compressed ? await unpackInBackground(value.encoding === 'gzip-base64' ? value.data : value.reference) : value
    if (!isSavedReference(data)) return null
    const queries = storedQueries(data, compressed && servesSerializedQueries(value))
    if (!queries) return null
    const { construction: _construction, queries: _queries, ...reference } = data
    const construction = compressed && value.encoding === 'gzip-base64-parts' ? value.construction : undefined
    return { reference, queries, ...(construction ? { construction } : {}) }
  } catch {
    return null
  }
}
