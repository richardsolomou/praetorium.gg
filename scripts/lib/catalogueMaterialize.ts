import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  catalogueSources,
  disabledCatalogueSources,
  SNAPSHOT_SOURCE_NAMES,
  type CatalogueSourceConfig,
  type SnapshotSourceName,
} from '../../src/server/catalogueSources'
import { fetchBattlemasterInto, fetchInto } from '../../src/server/sync'
import { applyPatches } from './cataloguePatches'
import type { CatalogueComposition } from '../../src/server/catalogueComposition'
import { composeCatalogue, validateCatalogueImports } from './catalogueComposition'

const root = path.resolve(import.meta.dirname, '..', '..')

type MaterializeOptions = {
  source?: (typeof SNAPSHOT_SOURCE_NAMES)[number]
  disabled?: ReadonlySet<SnapshotSourceName>
  patchesDirectory?: string
  report?: (message: string) => void
  composition?: CatalogueComposition | null
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
  const selected = options.source ? [options.source] : SNAPSHOT_SOURCE_NAMES.filter((name) => !disabled.has(name))
  const patches = options.patchesDirectory ?? path.join(root, 'catalogue', 'patches')
  try {
    // Isolate git apply from the application checkout that contains the staging directory.
    execFileSync('git', ['init', '--quiet', staged], { stdio: 'pipe' })
    const revisions: Partial<Record<SnapshotSourceName, string>> = {}
    for (const name of selected) {
      const source = sources[name]
      const target = path.join(staged, name)
      if (name === 'battlemaster') await fetchBattlemasterInto(sources.battlemaster, target)
      else {
        const repository = sources[name]
        await fetchInto(repository.repository, repository.revision, target, repository.path)
        if (name === 'icons') selectIcons(staged, sources.icons)
      }
      const corrections = !options.composition ? applyPatches(staged, path.join(patches, name), name) : null
      revisions[name] = corrections
        ? createHash('sha256')
            .update(JSON.stringify({ base: source.revision, corrections }))
            .digest('hex')
        : source.revision
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
      await composeCatalogue(staged, sources, composition, patches, omitted, options.report)
      for (const name of selected.filter((source) => source === 'icons' || source === 'battlemaster'))
        applyPatches(staged, path.join(patches, name), name)
      if (!omitted.has('definitions')) validateCatalogueImports(path.join(staged, 'definitions'))
    }
    fs.rmSync(path.join(staged, '.git'), { recursive: true })
    checkOutput()
    const previous = `${directory}.previous-${randomUUID()}`
    if (fs.existsSync(directory)) fs.renameSync(directory, previous)
    try {
      fs.renameSync(staged, directory)
    } catch (error) {
      if (fs.existsSync(previous)) fs.renameSync(previous, directory)
      throw error
    }
    if (fs.existsSync(previous)) fs.rmSync(previous, { recursive: true })
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
}
