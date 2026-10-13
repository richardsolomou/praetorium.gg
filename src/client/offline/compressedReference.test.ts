import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate'
import { expect, it } from 'vitest'
import { compressReference, decompressReference } from './compressedReference'
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

it('writes a standard gzip stream containing the complete reference', async () => {
  expect(JSON.parse(strFromU8(gunzipSync(strToU8(atob((await compressReference(data)).data), true))))).toEqual(data)
})

it('rejects an oversized gzip output before allocating its buffer', async () => {
  const bytes = strToU8(atob((await compressReference(data)).data), true)
  new DataView(bytes.buffer).setUint32(bytes.length - 4, 100_000_001, true)
  expect(decompressReference({ encoding: 'gzip-base64', data: btoa(strFromU8(bytes, true)) })).toBeNull()
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
