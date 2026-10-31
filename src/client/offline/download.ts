import {
  MAX_OFFLINE_BYTES,
  isOfflineReferenceVersion,
  type OfflineAssets,
  type OfflineReferenceData,
  type OfflineReferenceVersion,
  type OfflineAppVersion,
} from '../../contracts/offlineReference'
import { withTimeout } from '../abortSignals'
import { dataUrl } from '../imageFile'
import { referenceJsonExpression } from '../../contracts/embeddedReference'

/** An app file, fetched without cookies and abandoned after 30 seconds. */
const fetchAsset = (url: string | URL, signal: AbortSignal, init: RequestInit = {}) =>
  fetch(url, { ...init, credentials: 'omit', signal: withTimeout(signal, 30_000) })

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

export async function offlineReferenceVersion(signal: AbortSignal): Promise<OfflineReferenceVersion> {
  const value: unknown = await fetchManifest('/offline-reference-version.json', signal)
  if (!isOfflineReferenceVersion(value)) throw new Error('The reference version is invalid')
  return value
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

/** The offline application for a complete download, for the service worker or native shell to store. */
export async function offlineApplication(data: OfflineReferenceData, version: OfflineAppVersion, signal: AbortSignal, origin: string) {
  const cssResponse = await fetchAsset(new URL(version.css, origin), signal)
  if (!cssResponse.ok) throw new Error('The app styles could not be downloaded.')
  let css = await cssResponse.text()
  for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
    const url = new URL(match[1]!, new URL(version.css, origin))
    if (url.protocol !== 'data:') css = css.replaceAll(match[0], `url("${await resource(url.href, signal)}")`)
  }
  const assets: OfflineAssets = { css, logo: await resource(new URL('/logo.svg', origin).href, signal) }
  const scriptResponse = await fetchAsset(new URL(version.script, origin), signal)
  if (!scriptResponse.ok) throw new Error('The offline app is unavailable. Please try again.')
  const script = await scriptResponse.text()
  // The native shell injects the first script's download into hosted pages, so the styles and logo follow apart.
  const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src 'self' data: https:; font-src data:; connect-src 'self' https://raw.githubusercontent.com ${origin.replace(/^http/, 'ws')}; worker-src 'self' blob: data:; base-uri 'none'; form-action 'self'"></head><body><script>window.PraetoriumOffline=${referenceJsonExpression(JSON.stringify(data))};</script><script>window.PraetoriumOfflineAssets=${referenceJsonExpression(JSON.stringify(assets))};</script><script type="module">${script.replaceAll('</script', '<\\/script')}</script></body></html>`
  if (new TextEncoder().encode(html).byteLength > MAX_OFFLINE_BYTES) throw new Error('The reference exceeds this device’s download limit.')
  return html
}
