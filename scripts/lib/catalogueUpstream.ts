import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { catalogueSourcesSchema, type CatalogueSourceConfig, type SourceName } from '../../src/server/catalogueSources'
import { catalogueCompositionSchema, type CatalogueComposition } from '../../src/server/catalogueComposition'
import { battlemasterCatalogue, fetchInto } from '../../src/server/sync'
import { userCacheRoot } from './catalogueCache'

/** The commit a GitHub branch points at now. */
export function upstreamHead(repository: string, branch: string) {
  const ref = `refs/heads/${branch}`
  const result = execFileSync('git', ['ls-remote', '--exit-code', `https://github.com/${repository}.git`, ref], {
    encoding: 'utf8',
    timeout: 20_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
    .trim()
    .split(/\s+/)
  const head = result[0]
  if (!head || !/^[a-f0-9]{40}$/.test(head) || result[1] !== ref || result.length !== 2)
    throw new Error(`invalid upstream commit for ${repository}@${branch}`)
  return head
}

/** A source's files at one commit, fetched once into the per-user cache, which keeps only the latest commit fetched. */
export async function cachedUpstream(repository: string, revision: string, sourcePath?: string) {
  const parent = path.join(userCacheRoot(), 'upstream-sources', repository.replace('/', '__'))
  const directory = path.join(parent, revision)
  if (!fs.existsSync(directory)) {
    await fetchInto(repository, revision, directory, sourcePath)
    for (const other of fs.readdirSync(parent))
      if (other !== revision) fs.rmSync(path.join(parent, other), { recursive: true, force: true })
  }
  return sourcePath ? path.join(directory, sourcePath) : directory
}

export async function resolveCatalogueUpstream(
  sources: CatalogueSourceConfig,
  composition: CatalogueComposition | null,
  report: (message: string) => void = () => {},
) {
  const names: SourceName[] = ['definitions', 'points', 'datacards']
  for (const entry of composition?.editions ?? []) {
    if (entry.edition.status === 'retired' && !entry.snapshot && (entry.base || names.some((name) => !entry.sources[name])))
      throw new Error(`${entry.edition.id} must pin every source before updating the current rules`)
  }
  const heads = new Map<string, string>()
  let changed = false
  const revision = (label: string, before: string, after: string) => {
    if (before !== after) {
      changed = true
      report(`${label}: ${before} -> ${after}`)
    }
    return after
  }
  const resolve = <T extends CatalogueSourceConfig['definitions']>(source: T, label: string): T => {
    const key = `${source.repository}@${source.branch}`
    const head = heads.get(key) ?? upstreamHead(source.repository, source.branch)
    heads.set(key, head)
    return { ...source, revision: revision(label, source.revision, head) }
  }
  const nextSources = catalogueSourcesSchema.parse({
    ...Object.fromEntries([...names, 'icons' as const].map((name) => [name, resolve(sources[name], name)])),
    ...(sources.translations ? { translations: resolve(sources.translations, 'translations') } : {}),
    battlemaster: {
      ...sources.battlemaster,
      revision: revision('battlemaster', sources.battlemaster.revision, (await battlemasterCatalogue(sources.battlemaster)).revision),
    },
  })
  const nextComposition = composition
    ? catalogueCompositionSchema.parse({
        ...composition,
        overlays: composition.overlays.map((overlay) => resolve(overlay, `overlay ${overlay.source}`)),
        editions: composition.editions.map((entry) =>
          entry.edition.status === 'retired' || entry.snapshot
            ? entry
            : {
                ...entry,
                sources: Object.fromEntries(
                  Object.entries(entry.sources).map(([name, source]) => [name, resolve(source, `${entry.edition.id}/${name}`)]),
                ),
                overlays: entry.overlays.map((overlay) => resolve(overlay, `${entry.edition.id}/overlay ${overlay.source}`)),
              },
        ),
      })
    : null
  return { sources: nextSources, composition: nextComposition, changed }
}
