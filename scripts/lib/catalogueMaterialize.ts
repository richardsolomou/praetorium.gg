import { execFileSync } from 'node:child_process'
import { hash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  catalogueSources,
  disabledCatalogueSources,
  type ReleaseSource,
  releasesOf,
  SNAPSHOT_SOURCE_NAMES,
  type CatalogueSourceConfig,
  type SnapshotSourceName,
} from '../../src/server/catalogueSources'
import { fetchBattlemasterInto, fetchInto, fetchReleaseInto } from '../../src/server/sync'
import { applyPatches } from './cataloguePatches'
import { type CatalogueComposition, readCatalogueComposition } from '../../src/server/catalogueComposition'
import { checkVsDataRelease, compactVsDataRelease, writeVsDataConstruction } from '../../src/server/vsDataRelease'
import { replaceDirectory } from '../../src/server/replaceDirectory'
import { withholdCopiedSummaries } from '../../src/server/vsDataSummaries'
import { composeCatalogue, validateCatalogueImports } from './catalogueComposition'

const root = path.resolve(import.meta.dirname, '..', '..')

type MaterializeOptions = {
  source?: (typeof SNAPSHOT_SOURCE_NAMES)[number]
  disabled?: ReadonlySet<SnapshotSourceName>
  patchesDirectory?: string
  report?: (message: string) => void
  composition?: CatalogueComposition | null
  retainedDirectory?: string
}

function selectIcons(directory: string, source: CatalogueSourceConfig['icons']) {
  const selected = path.join(directory, 'selected-icons')
  fs.mkdirSync(selected)
  for (const [id, file] of Object.entries(source.icons)) {
    if (!/^[\w/-]+\.svg$/.test(file) || file.startsWith('/') || file.split('/').some((part) => part === '..' || !part)) {
      throw new Error(`invalid icon selection ${id}`)
    }
    const svg = fs.readFileSync(path.join(directory, 'icons', source.path ?? '', file))
    if (svg.length > 256 * 1024 || !/<svg[\s>]/.test(svg.toString()) || /<script[\s>]/i.test(svg.toString())) {
      throw new Error(`invalid icon file ${id}`)
    }
    fs.writeFileSync(path.join(selected, `${id}.svg`), svg)
  }
  fs.rmSync(path.join(directory, 'icons'), { recursive: true })
  fs.renameSync(selected, path.join(directory, 'icons'))
}

/** Each pinned VS Data release, verified, as one file named for the rules version it describes. */
/**
 * Each pinned VS Data release, verified and matched to the rules version it describes among those the checkout
 * configures, kept compact for each version `composition` builds; a build may leave some out, such as the versions only
 * the private store holds, and their releases are verified all the same.
 */
async function materializeSummaries(
  source: ReleaseSource,
  target: string,
  composition: CatalogueComposition | null | undefined,
  report?: (message: string) => void,
) {
  const configured = readCatalogueComposition(path.resolve('catalogue')) ?? composition
  const built = new Set((composition ?? configured)?.editions.map((entry) => entry.edition.id))
  const editions = (configured?.editions ?? []).map((entry) => entry.edition)
  fs.mkdirSync(target)
  for (const release of releasesOf(source)) {
    const unpacked = `${target}.release`
    await fetchReleaseInto(release, unpacked)
    const edition = checkVsDataRelease(unpacked, editions)
    if (!built.has(edition)) {
      fs.rmSync(unpacked, { recursive: true, force: true })
      report?.(`${release.release} verified; this build leaves out ${edition}`)
      continue
    }
    const file = path.join(target, `${edition}.json`)
    if (fs.existsSync(file)) throw new Error(`${release.release} describes a rules version another pinned release already does`)
    writeVsDataConstruction(unpacked, path.join(target, `${edition}.construction.json`))
    compactVsDataRelease(unpacked, file)
  }
}

export async function materializeCatalogue(directory: string, sources = catalogueSources, options: MaterializeOptions = {}) {
  const checkOutput = () => {
    if (fs.lstatSync(directory, { throwIfNoEntry: false })?.isSymbolicLink())
      throw new Error('refusing to replace an activated snapshot symlink')
  }
  checkOutput()
  const disabled = options.disabled ?? disabledCatalogueSources()
  if (options.source && disabled.has(options.source)) throw new Error(`${options.source} is disabled`)
  const parent = path.dirname(path.resolve(directory))
  fs.mkdirSync(parent, { recursive: true })
  const work = fs.mkdtempSync(path.join(parent, '.materialize-'))
  const staged = path.join(work, 'data')
  fs.mkdirSync(staged)
  const selected = options.source ? [options.source] : SNAPSHOT_SOURCE_NAMES.filter((name) => !disabled.has(name) && sources[name])
  const patches = options.patchesDirectory ?? path.join(root, 'catalogue', 'patches')
  try {
    // Isolate git apply from the application checkout that contains the staging directory.
    execFileSync('git', ['init', '--quiet', staged], { stdio: 'pipe' })
    const revisions: Partial<Record<SnapshotSourceName, string>> = {}
    for (const name of selected) {
      const source = sources[name]
      if (!source) throw new Error(`${name} is not configured`)
      const target = path.join(staged, name)
      if (name === 'battlemaster') await fetchBattlemasterInto(sources.battlemaster, target)
      else if (name === 'summaries') await materializeSummaries(sources.summaries!, target, options.composition, options.report)
      else {
        const repository = source as Exclude<typeof source, CatalogueSourceConfig['battlemaster'] | CatalogueSourceConfig['summaries']>
        await fetchInto(repository.repository, repository.revision, target, repository.path)
        if (name === 'icons') selectIcons(staged, sources.icons)
      }
      const corrections = !options.composition ? applyPatches(staged, path.join(patches, name), name) : null
      // One pin's archive names its revision; several are named together, so changing any one changes the revision.
      const pinned = name === 'summaries' ? releasesOf(sources.summaries!) : [source]
      const pins = pinned.length > 1 ? hash('sha256', JSON.stringify(pinned.map((release) => release.revision))) : source.revision
      // Summaries are compacted here, so a change to compacting the same releases is a new revision too, which is what
      // servers and browsers key their cached reads by.
      const revision =
        name === 'summaries'
          ? hash(
              'sha256',
              JSON.stringify({
                pins,
                compacted: fs
                  .readdirSync(target)
                  .sort()
                  .map((file) => [file, hash('sha256', fs.readFileSync(path.join(target, file)))]),
              }),
            )
          : pins
      revisions[name] = corrections ? hash('sha256', JSON.stringify({ base: revision, corrections })) : revision
      options.report?.(`${name}: ${source.revision}`)
    }
    fs.writeFileSync(path.join(staged, 'revision.json'), `${JSON.stringify(revisions, null, 2)}\n`)
    if (options.composition) {
      const composition = options.source
        ? {
            ...options.composition,
            overlays: options.composition.overlays.filter((overlay) => overlay.source === options.source),
            editions: [],
          }
        : options.composition
      const omitted = options.source
        ? new Set<SnapshotSourceName>([...disabled, ...SNAPSHOT_SOURCE_NAMES.filter((name) => name !== options.source)])
        : disabled
      await composeCatalogue(staged, sources, composition, patches, omitted, options.report, options.retainedDirectory)
      for (const name of selected.filter((source) => source === 'icons' || source === 'battlemaster'))
        applyPatches(staged, path.join(patches, name), name)
      if (!omitted.has('definitions')) validateCatalogueImports(path.join(staged, 'definitions'))
      // Read once here, beside every source file, rather than by each server that serves the summaries.
      if (!omitted.has('summaries'))
        for (const withheld of withholdCopiedSummaries(staged))
          options.report?.(`summary withheld for repeating a source's words: ${withheld}`)
    }
    fs.rmSync(path.join(staged, '.git'), { recursive: true })
    checkOutput()
    replaceDirectory(staged, directory)
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
}
