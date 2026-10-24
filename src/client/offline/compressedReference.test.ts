import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate'
import { expect, it } from 'vitest'
import {
  compressReference,
  decompressReference,
  lazyQueries,
  restoreReferenceParts,
  serializeQuery,
  withConstructionOf,
} from './compressedReference'
import type { OfflineReferenceData } from '../../contracts/offlineReference'

const data: OfflineReferenceData = {
  version: 1,
  savedAt: 1,
  revision: 'saved',
  queries: [{ key: ['rule-index'], data: { title: 'Imotekh … </script> "quotes" \\slashes'.repeat(1_000) } }],
  search: { factions: [], detachments: [], datasheets: [], missions: [], rules: [] },
  css: '',
  logo: '',
}

it('keeps the reference compressed across JSON serialization and restores its Unicode content', async () => {
  const packed = JSON.parse(JSON.stringify(await compressReference(data)))
  expect({ restored: decompressReference(packed), smaller: JSON.stringify(packed).length < JSON.stringify(data).length / 4 }).toEqual({
    restored: data,
    smaller: true,
  })
})

const gzipBase64 = (value: unknown) => btoa(strFromU8(gzipSync(strToU8(JSON.stringify(value))), true))
const construction = { version: 1, revision: 'saved', files: [], datacards: { packed: [] }, mfm: { packed: [] }, rules: { packed: [] } }
const withConstruction = { ...data, construction } as unknown as OfflineReferenceData

it('writes the reference as a standard gzip stream with each query serialized', async () => {
  const packed = await compressReference(data)
  expect(packed.encoding === 'gzip-base64-parts' && JSON.parse(strFromU8(gunzipSync(strToU8(atob(packed.reference), true))))).toEqual({
    ...data,
    queries: data.queries.map(({ key, data: value }) => ({ key, json: JSON.stringify(value) })),
  })
})

it('packs construction data apart from the reference', async () => {
  const packed = await compressReference(withConstruction)
  expect(packed.encoding === 'gzip-base64-parts' && JSON.parse(strFromU8(gunzipSync(strToU8(atob(packed.construction!), true))))).toEqual(
    construction,
  )
})

it('restores construction data on first use', async () => {
  expect(decompressReference(await compressReference(withConstruction))?.construction).toEqual(construction)
})

it('defers decoding construction data until it is read', async () => {
  const restored = decompressReference(await compressReference(withConstruction))
  expect(typeof Object.getOwnPropertyDescriptor(restored, 'construction')?.get).toBe('function')
})

it('keeps the reference when its construction data is corrupt', () => {
  expect(
    decompressReference({ encoding: 'gzip-base64-parts', reference: gzipBase64(data), construction: 'broken' })?.construction,
  ).toBeUndefined()
})

it('restores a reference saved as one compressed document', () => {
  expect(decompressReference({ encoding: 'gzip-base64', data: gzipBase64(data) })).toEqual(data)
})

it('rejects an oversized gzip output before allocating its buffer', async () => {
  const packed = await compressReference(data)
  const bytes = strToU8(atob(packed.encoding === 'gzip-base64-parts' ? packed.reference : ''), true)
  new DataView(bytes.buffer).setUint32(bytes.length - 4, 100_000_001, true)
  expect(decompressReference({ encoding: 'gzip-base64-parts', reference: btoa(strFromU8(bytes, true)) })).toBeNull()
})

it('does not serialize a cancelled reference download', async () => {
  await expect(compressReference(data, AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' })
})

it('cancels reference compression in progress', async () => {
  const controller = new AbortController()
  const compressed = compressReference(data, controller.signal)
  controller.abort()
  await expect(compressed).rejects.toMatchObject({ name: 'AbortError' })
})

it('rejects a reference above the uncompressed download limit', async () => {
  await expect(compressReference({ ...data, css: 'x'.repeat(100_000_001) })).rejects.toThrow('download limit')
})

it.each(['broken', btoa(strFromU8(gzipSync(strToU8('{"version":1}')), true))])(
  'ignores corrupt or incomplete saved reference data',
  (text) => {
    expect(decompressReference({ encoding: 'gzip-base64', data: text })).toBeNull()
  },
)

it('restores the reference with the native stream, its queries serialized and construction data packed', async () => {
  const packed = await compressReference(withConstruction)
  const { queries, ...reference } = data
  expect(await restoreReferenceParts(packed)).toEqual({
    reference,
    queries: queries.map(({ key, data: value }) => ({ key, json: JSON.stringify(value) })),
    construction: packed.encoding === 'gzip-base64-parts' ? packed.construction : undefined,
  })
})

it('rejects corrupt data restored in the background', async () => {
  expect(await restoreReferenceParts({ encoding: 'gzip-base64-parts', reference: 'broken' })).toBeNull()
})

it('saves construction data that was restored packed without decoding it', async () => {
  // Packed by another encoder, so decoding and packing it again would change the saved string.
  const packed = gzipBase64(construction)
  const restored = decompressReference({
    encoding: 'gzip-base64-parts',
    reference: (await compressReference(data)).reference,
    construction: packed,
  })!
  const saved = await compressReference(withConstructionOf({ ...data, revision: 'next' }, restored))
  expect(saved.encoding === 'gzip-base64-parts' && saved.construction).toBe(packed)
})

it('carries construction data a fresh download holds', () => {
  expect(withConstructionOf({ ...data }, withConstruction).construction).toEqual(construction)
})

it('serializes a restored query again without parsing it', () => {
  const [entry] = lazyQueries([{ key: ['rule-index'], json: 'not parsed' }])
  expect(serializeQuery(entry!)).toEqual({ key: ['rule-index'], json: 'not parsed' })
})
