import {
  MAX_OFFLINE_BYTES,
  isReferenceBundle,
  type OfflineReferenceData,
  type OfflineReferenceBundle,
  type OfflineReferenceVersion,
  type OfflineAppVersion,
} from '../../contracts/offlineReference'

async function fetchManifest(url: string, signal: AbortSignal) {
  const response = await fetch(url, {
    credentials: 'omit',
    cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  })
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
  const value = await fetchManifest('/offline-reference-version.json', signal)
  if (
    typeof value.revision !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.revision) ||
    value.bundle !== `/assets/reference-${value.revision}.bin`
  )
    throw new Error('The reference version is invalid')
  return value
}

export async function referenceBundle(
  version: OfflineReferenceVersion,
  signal: AbortSignal,
  previous?: OfflineReferenceData | null,
): Promise<OfflineReferenceBundle> {
  if (previous?.revision === version.revision) return previous
  const downloadSignal = AbortSignal.any([signal, AbortSignal.timeout(60_000)])
  const response = await fetch(version.bundle, { credentials: 'omit', signal: downloadSignal })
  if (!response.ok || !response.body) throw new Error('The reference bundle is unavailable')
  const reader = response.body.pipeThrough(new DecompressionStream('gzip')).getReader()
  const parts: Uint8Array[] = []
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
      parts.push(result.value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const part of parts) {
      bytes.set(part, offset)
      offset += part.byteLength
    }
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (!isReferenceBundle(value) || value.revision !== version.revision) throw new Error('The reference bundle is invalid')
    return value
  } finally {
    downloadSignal.removeEventListener('abort', abort)
    await reader.cancel().catch(() => {})
  }
}

async function resource(url: string, signal: AbortSignal) {
  const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) })
  if (!response.ok) throw new Error('The app could not be downloaded. Please try again.')
  const blob = await response.blob()
  if (blob.size > 5_000_000) throw new Error('Reference asset exceeds the download limit')
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Reference asset could not be read'))
    reader.readAsDataURL(blob)
  })
}

export async function downloadReference(
  signal: AbortSignal,
  manifest: OfflineReferenceVersion,
  version: OfflineAppVersion,
  previous?: OfflineReferenceData | null,
) {
  const bundle = await referenceBundle(manifest, signal, previous)
  const saved: OfflineReferenceData = { ...bundle, version: 1, savedAt: Date.now(), appRevision: version.revision, css: '', logo: '' }
  const cssResponse = await fetch(version.css, { credentials: 'omit', signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) })
  if (!cssResponse.ok) throw new Error('The app styles could not be downloaded.')
  let css = await cssResponse.text()
  for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
    const url = new URL(match[1]!, new URL(version.css, location.origin))
    if (url.protocol !== 'data:') css = css.replaceAll(match[0], `url("${await resource(url.href, signal)}")`)
  }
  saved.css = css
  saved.logo = await resource('/logo.svg', signal)
  const scriptResponse = await fetch(version.script, {
    credentials: 'omit',
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  })
  if (!scriptResponse.ok) throw new Error('The offline app is unavailable. Please try again.')
  const script = await scriptResponse.text()
  const json = JSON.stringify(saved).replaceAll('<', '\\u003c')
  const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src 'self' data: https:; font-src data:; connect-src 'self' ${location.origin.replace(/^http/, 'ws')}; worker-src 'self'; base-uri 'none'; form-action 'self'"></head><body><script>window.PraetoriumOffline=${json};</script><script type="module">${script.replaceAll('</script', '<\\/script')}</script></body></html>`
  if (new TextEncoder().encode(html).byteLength > MAX_OFFLINE_BYTES) throw new Error('The reference exceeds this device’s download limit.')
  return { html, savedAt: saved.savedAt, data: saved }
}
