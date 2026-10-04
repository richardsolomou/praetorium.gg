import {
  offlineReferenceManifest,
  factionIndex,
  faction,
  factionDatasheets,
  datasheetBySlug,
  detachmentDetail,
  gameReferences,
  ruleIndex,
  ruleSection,
  terrainReferences,
  dispositionDetachments,
  deployments,
} from '../../server/functions'
import { MAX_OFFLINE_BYTES, MAX_OFFLINE_QUERIES, type OfflineReferenceData } from '../../contracts/offlineReference'
import { terrainMatchupIds } from '../queries/references'

export async function offlineAppVersion(signal: AbortSignal): Promise<{ revision: string; css: string }> {
  const response = await fetch('/offline-app-version.json', {
    credentials: 'omit',
    cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  })
  if (!response.ok) throw new Error('The offline app is unavailable. Please try again.')
  const value = await response.json()
  if (typeof value.revision !== 'string' || typeof value.css !== 'string' || !/^\/assets\/[\w.-]+\.css$/.test(value.css))
    throw new Error('The offline app version is invalid.')
  return value
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

export async function downloadReference(signal: AbortSignal, progress: (done: number, total: number) => void) {
  const anonymousFetch: typeof fetch = (input, init) =>
    fetch(input, { ...init, credentials: 'omit', cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) })
  const options = { signal, fetch: anonymousFetch }
  const version = await offlineAppVersion(signal)
  const manifest = await offlineReferenceManifest(options)
  const saved: OfflineReferenceData = {
    version: 1,
    savedAt: Date.now(),
    revision: manifest.revision,
    appRevision: version.revision,
    search: manifest.search,
    queries: [],
    css: '',
    logo: '',
  }
  let bytes = 0
  const put = <T>(key: readonly unknown[], data: T): T => {
    bytes += new TextEncoder().encode(JSON.stringify({ key, data })).byteLength
    if (bytes > MAX_OFFLINE_BYTES || saved.queries.length >= MAX_OFFLINE_QUERIES)
      throw new Error('The reference exceeds this device’s download limit.')
    saved.queries.push({ key, data })
    return data
  }
  const [factions, references, rules] = await Promise.all([
    factionIndex(options).then((data) => put(['faction-index'], data)),
    gameReferences(options).then((data) => put(['game-references'], data)),
    ruleIndex(options).then((data) => put(['rule-index'], data)),
  ])
  if (!factions || !references || !rules) throw new Error('The reference is not ready to download. Please try again.')
  const tasks: (() => Promise<unknown>)[] = []
  for (const summary of factions.factions)
    tasks.push(async () => {
      const data = await faction({ ...options, data: { catalogueId: summary.id } })
      if (!data) throw new Error(`Unable to download ${summary.displayName}`)
      if (data.icon) data.icon = await resource(data.icon, signal)
      put(['faction', data.id], data)
      put(['faction', data.slug], data)
      const units = put(
        ['faction-datasheets', data.id, ''],
        await factionDatasheets({ ...options, data: { catalogueId: data.id, query: '' } }),
      )
      for (const unit of units)
        tasks.push(async () => {
          const sheet = await datasheetBySlug({ ...options, data: { catalogueId: data.id, slug: unit.slug } })
          if (!sheet) throw new Error(`Unable to download ${unit.name}`)
          put(['datasheet-slug', data.id, unit.slug], sheet)
        })
      for (const detachment of data.detachments) {
        if (detachment.referenceRoute?.catalogueId !== data.slug) continue
        tasks.push(async () => {
          const detail = await detachmentDetail({ ...options, data: { catalogueId: data.id, slug: detachment.slug } })
          if (!detail) throw new Error(`Unable to download ${detachment.name}`)
          put(['detachment-detail', data.id, detachment.slug], detail)
        })
      }
    })
  for (const document of rules.documents)
    for (const section of document.sections)
      tasks.push(async () => {
        const data = await ruleSection({ ...options, data: { documentId: document.slug, sectionId: section.slug } })
        if (!data) throw new Error(`Unable to download ${section.title}`)
        put(['rule-section', document.slug, section.slug], data)
      })
  for (const disposition of references.dispositions)
    tasks.push(async () =>
      put(
        ['disposition-detachments', disposition.id],
        await dispositionDetachments({ ...options, data: { dispositionId: disposition.id } }),
      ),
    )
  const matchups = new Map<string, string[]>()
  for (const pack of references.packs)
    for (const mission of pack.missions)
      for (const pair of mission.matchups) {
        if (!pair[0] || !pair[1]) continue
        const ids = terrainMatchupIds([pair[0].id, pair[1].id])
        matchups.set(JSON.stringify(ids), ids)
      }
  for (const ids of matchups.values())
    tasks.push(async () =>
      put(['terrain-references', 6, ...ids], await terrainReferences({ ...options, data: { matchupIds: ids, geometryVersion: 6 } })),
    )
  tasks.push(async () => put(['deployments'], await deployments(options)))
  let done = 0
  // Tasks may append the datasheets discovered by each faction; never enqueue the entire corpus as concurrent requests.
  while (done < tasks.length) {
    signal.throwIfAborted()
    const batch = tasks.slice(done, done + 3)
    await Promise.all(batch.map((task) => task()))
    done += batch.length
    progress(done, tasks.length)
    if (tasks.length > MAX_OFFLINE_QUERIES) throw new Error('The reference exceeds this device’s download limit.')
  }
  for (const summary of factions.factions) {
    const data = saved.queries.find((entry) => entry.key[0] === 'faction' && entry.key[1] === summary.id)?.data as
      | { icon: string | null }
      | undefined
    summary.icon = data?.icon ?? null
  }
  const cssResponse = await fetch(version.css, { credentials: 'omit', signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) })
  if (!cssResponse.ok) throw new Error('The app styles could not be downloaded.')
  let css = await cssResponse.text()
  for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
    const url = new URL(match[1]!, new URL(version.css, location.origin))
    if (url.protocol !== 'data:') css = css.replaceAll(match[0], `url("${await resource(url.href, signal)}")`)
  }
  saved.css = css
  saved.logo = await resource('/logo.svg', signal)
  const scriptResponse = await fetch('/offline-app.js', {
    credentials: 'omit',
    cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  })
  if (!scriptResponse.ok) throw new Error('The offline app is unavailable. Please try again.')
  const script = await scriptResponse.text()
  if (
    (await offlineReferenceManifest(options)).revision !== saved.revision ||
    (await offlineAppVersion(signal)).revision !== saved.appRevision
  )
    throw new Error('The reference changed during the download. Please try again.')
  const json = JSON.stringify(saved).replaceAll('<', '\\u003c')
  const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src 'self' data: https:; font-src data:; connect-src 'self' ${location.origin.replace(/^http/, 'ws')}; worker-src 'self'; base-uri 'none'; form-action 'self'"></head><body><script>window.PraetoriumOffline=${json};</script><script type="module">${script.replaceAll('</script', '<\\/script')}</script></body></html>`
  if (new TextEncoder().encode(html).byteLength > MAX_OFFLINE_BYTES) throw new Error('The reference exceeds this device’s download limit.')
  return { html, savedAt: saved.savedAt, data: saved }
}
