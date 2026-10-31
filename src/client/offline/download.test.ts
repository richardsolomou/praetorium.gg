import { afterEach, expect, it, vi } from 'vitest'
import { offlineApplication, offlineAppVersion, offlineReferenceVersion } from './download'
import { embeddedReferenceJson } from '../../contracts/embeddedReference'
import type { OfflineReferenceData, OfflineReferenceVersion } from '../../contracts/offlineReference'

vi.mock('../imageFile', () => ({ dataUrl: async () => 'data:image/svg+xml,logo' }))

const asset = (kind: string, fill: string, directory = '/assets') => `${directory}/${kind}-${fill.repeat(64)}.bin`
const version: OfflineReferenceVersion = {
  revision: 'a'.repeat(64),
  reference: { core: asset('reference', 'b'), search: asset('reference', 'c'), parts: { 'faction:necrons': asset('reference', 'd') } },
  construction: {
    catalogue: asset('construction', 'e'),
    rules: asset('construction', 'f'),
    editions: { legacy: asset('construction', '0') },
  },
}
const signal = new AbortController().signal
afterEach(() => vi.unstubAllGlobals())

it('rejects manifests that point outside immutable application assets', async () => {
  vi.stubGlobal('fetch', async () =>
    Response.json({ revision: version.revision, css: '/assets/style-hash.css', script: 'https://other.test/app.js', reference: {} }),
  )
  await expect(offlineReferenceVersion(signal)).rejects.toThrow('version is invalid')
  await expect(offlineAppVersion(signal)).rejects.toThrow('version is invalid')
})

it('accepts a manifest naming each part of the download', async () => {
  vi.stubGlobal('fetch', async () => Response.json(version))
  expect(await offlineReferenceVersion(signal)).toEqual(version)
})

it('accepts parts prepared at runtime under one runtime revision', async () => {
  const prefix = `/catalogue-assets/${'9'.repeat(64)}`
  const runtime = JSON.parse(JSON.stringify(version).replaceAll('/assets/', `${prefix}/`)) as OfflineReferenceVersion
  vi.stubGlobal('fetch', async () => Response.json(runtime))
  expect(await offlineReferenceVersion(signal)).toEqual(runtime)
})

it.each([
  { ...version, construction: { ...version.construction, rules: asset('construction', 'f', `/catalogue-assets/${'9'.repeat(64)}`) } },
  { ...version, reference: { ...version.reference, parts: { 'faction:necrons': '/private' } } },
  { ...version, construction: { ...version.construction, editions: { legacy: 1 } } },
  { ...version, construction: undefined },
])('rejects a manifest with a part from another runtime revision or outside its assets', async (value) => {
  vi.stubGlobal('fetch', async () => Response.json(value))
  await expect(offlineReferenceVersion(signal)).rejects.toThrow('version is invalid')
})

it('keeps the styles and logo out of the download record the native shell injects into every page', async () => {
  vi.stubGlobal('fetch', async (address: URL | string) => {
    const url = new URL(address)
    return url.pathname.endsWith('.css')
      ? new Response('body{color:red}')
      : new Response(url.pathname.endsWith('.svg') ? '<svg/>' : 'run()')
  })
  const data: OfflineReferenceData = { version: 2, savedAt: 1, appRevision: 'app', download: version, editions: [] }
  const html = await offlineApplication(
    data,
    { revision: 'app', css: '/assets/styles.css', script: '/assets/offline-app.js' },
    signal,
    'https://praetorium.gg',
  )
  expect(JSON.parse(embeddedReferenceJson(html)!)).toEqual(data)
})
