import {
  MAX_OFFLINE_BYTES,
  decodeReferenceBundle,
  isReferenceBundle,
  type OfflineReferenceData,
  type OfflineReferenceBundle,
  type OfflineReferenceVersion,
  type OfflineAppVersion,
} from '../../contracts/offlineReference'
import { anySignal } from '../abortSignals'
import { dataUrl } from '../imageFile'
import { referenceJsonExpression } from '../../contracts/embeddedReference'
import { compressReference, updatedReference } from './compressedReference'

/** An app file, fetched without cookies and abandoned after 30 seconds. */
const fetchAsset = (url: string | URL, signal: AbortSignal, init: RequestInit = {}) =>
  fetch(url, { ...init, credentials: 'omit', signal: anySignal([signal, AbortSignal.timeout(30_000)]) })

async function fetchManifest(url: string, signal: AbortSignal) {
  const response = await fetchAsset(url, signal, { cache: 'no-store' })
  if (!response.ok) throw new Error('The saved app manifest is unavailable')
  return response.json()
}

export async function offlineAppVersion(signal: AbortSignal): Promise<OfflineAppVersion> {
  const value = await fetchManifest('/offline-app-version.json', signal)
  if (
    typeof value.revision !== 'string' ||
    typeof value.css !== 'string' ||
    !/^\/assets\/[\w.-]+\.css$/.test(value.css) ||
    typeof value.script !== 'string' ||
    !/^\/assets\/offline-app-[a-f0-9]{64}\.js$/.test(value.script)
  )
    throw new Error('The offline app version is invalid')
  return value
}

const isAsset = (value: unknown, name: string) =>
  typeof value === 'string' && new RegExp(`^/(?:assets|catalogue-assets/[a-f0-9]{64})/${name}-[a-f0-9]{64}\\.bin$`).test(value)

export async function offlineReferenceVersion(signal: AbortSignal): Promise<OfflineReferenceVersion> {
  const value = await fetchManifest('/offline-reference-version.json', signal)
  if (
    typeof value.revision !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.revision) ||
    !isAsset(value.bundle, 'reference') ||
    !value.bundle.endsWith(`/reference-${value.revision}.bin`) ||
    !isAsset(value.construction?.current, 'construction') ||
    !isAsset(value.construction?.complete, 'construction') ||
    value.construction.current.slice(0, value.construction.current.lastIndexOf('/')) !==
      value.bundle.slice(0, value.bundle.lastIndexOf('/')) ||
    value.construction.complete.slice(0, value.construction.complete.lastIndexOf('/')) !==
      value.bundle.slice(0, value.bundle.lastIndexOf('/')) ||
    !Array.isArray(value.construction.versions) ||
    !value.construction.versions.every((id: unknown) => typeof id === 'string')
  )
    throw new Error('The reference version is invalid')
  return value
}

/** The construction download for the current rules, or with every other rules version when this device uses one. */
export const constructionBundleFor = (manifest: OfflineReferenceVersion, otherVersions: boolean) =>
  otherVersions ? manifest.construction.complete : manifest.construction.current

export async function bundleAt(url: string, signal: AbortSignal): Promise<OfflineReferenceBundle> {
  const downloadSignal = anySignal([signal, AbortSignal.timeout(60_000)])
  const response = await fetch(url, { credentials: 'omit', signal: downloadSignal })
  if (!response.ok || !response.body) throw new Error('The reference bundle is unavailable')
  const reader = response.body.pipeThrough(new DecompressionStream('gzip')).getReader()
  const decoder = new TextDecoder()
  let json = ''
  let size = 0
  const abort = () => void reader.cancel().catch(() => {})
  downloadSignal.addEventListener('abort', abort, { once: true })
  try {
    for (;;) {
      downloadSignal.throwIfAborted()
      const result = await reader.read()
      downloadSignal.throwIfAborted()
      if (result.done) break
      size += result.value.byteLength
      if (size > MAX_OFFLINE_BYTES) throw new Error('The reference exceeds this device’s download limit')
      json += decoder.decode(result.value, { stream: true })
    }
    json += decoder.decode()
    const value = decodeReferenceBundle(JSON.parse(json))
    if (!isReferenceBundle(value)) throw new Error('The reference bundle is invalid')
    return value
  } finally {
    downloadSignal.removeEventListener('abort', abort)
    await reader.cancel().catch(() => {})
  }
}

export async function referenceBundle(
  version: OfflineReferenceVersion,
  signal: AbortSignal,
  previous?: OfflineReferenceData | null,
): Promise<OfflineReferenceBundle> {
  if (previous?.revision === version.revision) return previous
  const value = await bundleAt(version.bundle, signal)
  if (value.revision !== version.revision) throw new Error('The reference bundle is invalid')
  return value
}

export async function constructionBundle(url: string, signal: AbortSignal) {
  const value = await bundleAt(url, signal)
  if (!value.construction) throw new Error('The construction bundle is invalid')
  return value.construction
}

async function resource(url: string, signal: AbortSignal) {
  const response = await fetchAsset(url, signal)
  if (!response.ok) throw new Error('The app could not be downloaded. Please try again.')
  const blob = await response.blob()
  if (blob.size > 5_000_000) throw new Error('Reference asset exceeds the download limit')
  return dataUrl(blob).catch(() => {
    throw new Error('Reference asset could not be read')
  })
}

/** The offline application around a complete saved reference, for the service worker or native shell to store. */
export async function offlineApplication(data: OfflineReferenceData, version: OfflineAppVersion, signal: AbortSignal, origin: string) {
  const saved = updatedReference(data, { appRevision: version.revision })
  const cssResponse = await fetchAsset(new URL(version.css, origin), signal)
  if (!cssResponse.ok) throw new Error('The app styles could not be downloaded.')
  let css = await cssResponse.text()
  for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
    const url = new URL(match[1]!, new URL(version.css, origin))
    if (url.protocol !== 'data:') css = css.replaceAll(match[0], `url("${await resource(url.href, signal)}")`)
  }
  saved.css = css
  saved.logo = await resource(new URL('/logo.svg', origin).href, signal)
  const scriptResponse = await fetchAsset(new URL(version.script, origin), signal)
  if (!scriptResponse.ok) throw new Error('The offline app is unavailable. Please try again.')
  const script = await scriptResponse.text()
  const json = referenceJsonExpression(JSON.stringify(await compressReference(saved, signal)))
  const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src 'self' data: https:; font-src data:; connect-src 'self' https://raw.githubusercontent.com ${origin.replace(/^http/, 'ws')}; worker-src 'self' blob: data:; base-uri 'none'; form-action 'self'"></head><body><script>window.PraetoriumOffline=${json};</script><script type="module">${script.replaceAll('</script', '<\\/script')}</script></body></html>`
  if (new TextEncoder().encode(html).byteLength > MAX_OFFLINE_BYTES) throw new Error('The reference exceeds this device’s download limit.')
  return { html, savedAt: saved.savedAt, data: saved }
}
