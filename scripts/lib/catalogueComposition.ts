import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import type { CatalogueFile } from '../../src/core/catalogue'
import {
  type CatalogueComposition,
  type CatalogueOverlay,
  CATALOGUE_COMPOSITION_FILE,
  catalogueCompositionSchema,
} from '../../src/server/catalogueComposition'
import type { CatalogueSourceConfig, SnapshotSourceName } from '../../src/server/catalogueSources'
import { fetchInto } from '../../src/server/sync'
import { applyPatches } from './cataloguePatches'

const revisionOf = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

export async function composeCatalogue(
  directory: string,
  sources: CatalogueSourceConfig,
  composition: CatalogueComposition,
  patches: string,
  disabled: ReadonlySet<SnapshotSourceName>,
  report?: (message: string) => void,
) {
  catalogueCompositionSchema.parse(composition)
  const work = fs.mkdtempSync(path.join(path.dirname(directory), '.composition-'))
  const fetched = new Map<string, string>()
  const overlayInto = async (target: string, overlays: readonly CatalogueOverlay[]) => {
    for (const overlay of overlays) {
      if (disabled.has(overlay.source)) throw new Error(`composition requires disabled source ${overlay.source}`)
      const key = JSON.stringify([overlay.repository, overlay.revision, overlay.path])
      let download = fetched.get(key)
      if (!download) {
        download = path.join(work, String(fetched.size))
        await fetchInto(overlay.repository, overlay.revision, download, overlay.path)
        fetched.set(key, download)
      }
      for (const file of overlay.files) {
        const from = path.join(download, file)
        if (!fs.statSync(from, { throwIfNoEntry: false })?.isFile()) throw new Error(`missing overlay file ${overlay.repository}:${file}`)
        const to = path.join(target, overlay.source, file)
        fs.mkdirSync(path.dirname(to), { recursive: true })
        fs.copyFileSync(from, to)
      }
      report?.(`${overlay.source}: selected ${overlay.files.length} files from ${overlay.repository}@${overlay.revision}`)
    }
  }
  const revisions = (target: string): Record<string, string> => JSON.parse(fs.readFileSync(path.join(target, 'revision.json'), 'utf8'))
  const editionRevisionsById: Record<string, Record<string, string>> = {}
  try {
    await overlayInto(directory, composition.overlays)
    const rootRevisions = revisions(directory)
    for (const name of ['definitions', 'points', 'datacards'] as const) {
      const overlays = composition.overlays.filter((overlay) => overlay.source === name)
      if (overlays.length) rootRevisions[name] = revisionOf({ base: sources[name], overlays })
    }
    for (const name of ['definitions', 'points', 'datacards'] as const) {
      if (!disabled.has(name)) {
        const corrections = applyPatches(directory, path.join(patches, name), name)
        if (corrections) rootRevisions[name] = revisionOf({ base: rootRevisions[name], corrections })
      }
    }
    for (const { edition, sources: replacements, overlays } of composition.editions) {
      const target = path.join(directory, 'editions', edition.id)
      fs.mkdirSync(target, { recursive: true })
      execFileSync('git', ['init', '--quiet', target], { stdio: 'pipe' })
      const editionRevisions = { ...rootRevisions }
      for (const name of ['definitions', 'points', 'datacards'] as const) {
        if (disabled.has(name)) throw new Error(`edition ${edition.id} requires disabled source ${name}`)
        const replacement = replacements[name]
        if (replacement) {
          await fetchInto(replacement.repository, replacement.revision, path.join(target, name), replacement.path)
          editionRevisions[name] = replacement.revision
        } else {
          fs.cpSync(path.join(directory, name), path.join(target, name), { recursive: true })
        }
      }
      await overlayInto(target, overlays)
      for (const name of ['definitions', 'points', 'datacards'] as const) {
        const selected = overlays.filter((overlay) => overlay.source === name)
        if (selected.length) editionRevisions[name] = revisionOf({ base: replacements[name] ?? rootRevisions[name], overlays: selected })
        const corrections = applyPatches(target, path.join(patches, 'editions', edition.id, name), name)
        if (corrections) editionRevisions[name] = revisionOf({ base: editionRevisions[name], corrections })
      }
      validateCatalogueImports(path.join(target, 'definitions'), edition.catalogueIds)
      fs.writeFileSync(path.join(target, 'revision.json'), `${JSON.stringify(editionRevisions, null, 2)}\n`)
      editionRevisionsById[edition.id] = editionRevisions
      fs.rmSync(path.join(target, '.git'), { recursive: true })
    }
    if (composition.editions.length) {
      rootRevisions.definitions = revisionOf({
        base: rootRevisions.definitions,
        editions: composition.editions,
        revisions: editionRevisionsById,
      })
    }
    fs.writeFileSync(path.join(directory, 'revision.json'), `${JSON.stringify(rootRevisions, null, 2)}\n`)
    fs.writeFileSync(
      path.join(directory, CATALOGUE_COMPOSITION_FILE),
      `${JSON.stringify({ ...composition, baseSources: sources }, null, 2)}\n`,
    )
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
}

export function validateCatalogueImports(directory: string, required: readonly string[] = []) {
  const books = new Map<string, CatalogueFile>()
  for (const name of fs.readdirSync(directory).filter((file) => file.endsWith('.json'))) {
    const file: CatalogueFile = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'))
    const root = file.catalogue ?? file.gameSystem
    if (!root?.id) throw new Error(`invalid catalogue file ${name}`)
    if (books.has(root.id)) throw new Error(`duplicate catalogue ID ${root.id}`)
    books.set(root.id, file)
  }
  for (const id of required)
    if (!books.get(id)?.catalogue || books.get(id)?.catalogue?.library) throw new Error(`missing playable catalogue ${id}`)
  for (const file of books.values()) {
    const book = file.catalogue
    if (!book) continue
    for (const id of [book.gameSystemId, ...(book.catalogueLinks ?? []).map((link) => link.targetId)]) {
      if (id && !books.has(id)) throw new Error(`catalogue ${book.id} imports missing catalogue ${id}`)
    }
  }
}
