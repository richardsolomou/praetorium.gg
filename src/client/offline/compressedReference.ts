import { gunzipSync, strFromU8, strToU8 } from 'fflate'
import { MAX_OFFLINE_BYTES, isConstructionData, isReferenceBundle, type OfflineReferenceData } from '../../contracts/offlineReference'

/**
 * A saved reference, gzip-compressed and base64-encoded so it survives JSON. `gzip-base64-parts` packs construction
 * data apart from the reference so restoring a page or search never decodes it, and keeps each query serialized so
 * restoring parses only the pages a player opens. `gzip-base64` is the single part older releases saved.
 */
export type CompressedReference =
  | { encoding: 'gzip-base64'; data: string }
  | { encoding: 'gzip-base64-parts'; reference: string; construction?: string }

type SerializedQuery = { key: readonly unknown[]; json: string }

/** The JSON a lazily parsed query was restored from, so serializing it again needs no parse. */
const restoredJson = new WeakMap<object, string>()

export const serializeQuery = (entry: OfflineReferenceData['queries'][number]): SerializedQuery => ({
  key: entry.key,
  json: restoredJson.get(entry) ?? JSON.stringify(entry.data),
})

const isSerializedQuery = (entry: unknown): entry is SerializedQuery =>
  Array.isArray((entry as SerializedQuery | null)?.key) && typeof (entry as SerializedQuery).json === 'string'

/** Query entries whose data is parsed the first time it is read. */
export function lazyQueries(queries: readonly SerializedQuery[]): OfflineReferenceData['queries'] {
  return queries.map(({ key, json }) => {
    let data: unknown
    let parsed = false
    const entry = {
      key,
      get data() {
        if (!parsed) {
          data = JSON.parse(json)
          parsed = true
        }
        return data
      },
    }
    restoredJson.set(entry, json)
    return entry
  })
}

export async function pack(value: unknown, signal?: AbortSignal) {
  signal?.throwIfAborted()
  const blob = new Blob([JSON.stringify(value)])
  if (blob.size > MAX_OFFLINE_BYTES) throw new Error('The reference exceeds this device’s download limit.')
  const compressed = blob.stream().pipeThrough(new CompressionStream('gzip'), { signal })
  const bytes = new Uint8Array(await new Response(compressed).arrayBuffer())
  return btoa(strFromU8(bytes, true))
}

/** Construction data still packed as it was saved, by the reference that carries it. */
const packedConstructions = new WeakMap<OfflineReferenceData, string>()

/** A reference's construction data as it was saved, still packed, so it can be handed on without decoding it here. */
export const packedConstructionOf = (data: OfflineReferenceData) => packedConstructions.get(data)

/** Every field but `construction`, read without decoding construction data that is still packed. */
export function referenceFields(data: OfflineReferenceData) {
  return Object.fromEntries(
    Object.keys(data)
      .filter((key) => key !== 'construction')
      .map((key) => [key, data[key as keyof OfflineReferenceData]]),
  ) as Omit<OfflineReferenceData, 'construction'>
}

export async function compressReference(
  data: OfflineReferenceData,
  signal?: AbortSignal,
): Promise<Extract<CompressedReference, { encoding: 'gzip-base64-parts' }>> {
  const reference = referenceFields(data)
  const construction = packedConstructions.get(data) ?? (data.construction ? await pack(data.construction, signal) : undefined)
  return {
    encoding: 'gzip-base64-parts',
    reference: await pack({ ...reference, queries: reference.queries.map(serializeQuery) }, signal),
    ...(construction ? { construction } : {}),
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

/** Decodes packed construction data with the browser's native stream, for a worker that holds it apart from the page. */
export async function unpackConstruction(packed: string): Promise<NonNullable<OfflineReferenceData['construction']>> {
  const construction = (await unpackInBackground(packed)) as NonNullable<OfflineReferenceData['construction']> | null
  if (!construction || !isConstructionData(construction)) throw new Error('The saved construction data is invalid')
  return construction
}

/** Attaches construction data that is decoded on first use: only offline roster construction needs it, and it is most of the download. */
export function withConstruction(data: OfflineReferenceData, packed: string) {
  let construction: OfflineReferenceData['construction'] | null = null
  const reference = { ...data }
  packedConstructions.set(data, packed)
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

/** `data` with the construction data `from` holds, kept packed when it is, so carrying it over decodes nothing. */
export function withConstructionOf(data: OfflineReferenceData, from: OfflineReferenceData): OfflineReferenceData {
  const packed = packedConstructions.get(from)
  if (packed) return withConstruction(data, packed)
  return from.construction ? { ...data, construction: from.construction } : data
}

/** `data` with `fields` replaced, keeping its construction data as it is held. */
export function updatedReference(data: OfflineReferenceData, fields: Partial<Omit<OfflineReferenceData, 'construction'>>) {
  return withConstructionOf({ ...referenceFields(data), ...fields }, data)
}

/** The queries of a saved reference as stored: serialized in parts, parsed in the single part older releases saved. */
function storedQueries(data: OfflineReferenceData, serialized: boolean): SerializedQuery[] | null {
  if (!serialized) return data.queries.map(serializeQuery)
  const queries: unknown[] = data.queries
  return queries.every(isSerializedQuery) ? queries : null
}

function assemble(packed: CompressedReference, data: unknown): OfflineReferenceData | null {
  if (packed.encoding === 'gzip-base64') return isSavedReference(data) ? data : null
  if (!isSavedReference(data) || 'construction' in data) return null
  const queries = storedQueries(data, true)
  if (!queries) return null
  const reference = { ...data, queries: lazyQueries(queries) }
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
 * A reference saved in a single part, or uncompressed, is returned without its construction data.
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
    const parts = compressed && value.encoding === 'gzip-base64-parts'
    const queries = storedQueries(data, parts)
    if (!queries) return null
    const { construction: _construction, queries: _queries, ...reference } = data
    const construction = parts ? value.construction : undefined
    return { reference, queries, ...(construction ? { construction } : {}) }
  } catch {
    return null
  }
}
