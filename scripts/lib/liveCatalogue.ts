import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { liveCatalogueRevision } from '../../src/server/liveCatalogue'
import { replaceDirectory } from '../../src/server/replaceDirectory'

const MANIFEST = 'public/offline-reference-version.json'

/** The browser download parts a revision's manifest names, by file name; a downloaded revision has no manifest. */
function manifestParts(revision: string) {
  const file = path.join(revision, MANIFEST)
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8').match(/(?:reference|construction)-[a-f0-9]{64}\.bin/g) ?? []
}

/**
 * Only workers on the same compiler wait for each other: a release's new replica must not wait out the one it replaces,
 * whose refresh can compile for many minutes.
 */
export async function refreshLiveCatalogue(
  root: string,
  prepare: (staging: string, previous: ReturnType<typeof liveCatalogueRevision>) => Promise<string | null>,
) {
  fs.mkdirSync(root, { recursive: true })
  const lock = new DatabaseSync(path.join(root, 'refresh.sqlite'), { timeout: 0 })
  let staging: string | undefined
  try {
    try {
      lock.exec('BEGIN IMMEDIATE')
    } catch (error) {
      if ((error as { errcode?: number }).errcode === 5) return false
      throw error
    }
    for (const name of fs.readdirSync(root))
      if (name.startsWith('.incoming-')) fs.rmSync(path.join(root, name), { recursive: true, force: true })
    staging = fs.mkdtempSync(path.join(root, '.incoming-'))
    const previous = liveCatalogueRevision(root)
    const id = await prepare(staging, previous)
    if (id === null || id === previous?.id) return false
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid prepared catalogue revision')
    for (const file of ['catalogue/revision.json', 'runtime/manifest.json', MANIFEST])
      if (!fs.statSync(path.join(staging, file), { throwIfNoEntry: false })?.isFile()) throw new Error(`Incomplete catalogue: ${file}`)
    const target = path.join(root, id)
    const assets = path.join(staging, 'public/assets')
    const assetDirectory = path.join(root, 'assets')
    for (const name of manifestParts(staging))
      if (![assets, assetDirectory].some((directory) => fs.existsSync(path.join(directory, name))))
        throw new Error(`Incomplete catalogue: ${name}`)
    if (fs.existsSync(assets)) {
      fs.cpSync(assets, assetDirectory, { recursive: true })
      fs.rmSync(assets, { recursive: true })
    }
    replaceDirectory(staging, target)
    const revisions = fs
      .readdirSync(root)
      .filter((name) => /^[a-f0-9]{64}$/.test(name))
      .sort((left, right) => fs.statSync(path.join(root, right)).mtimeMs - fs.statSync(path.join(root, left)).mtimeMs)
    const retained = new Set([id, ...(previous ? [previous.id] : [])])
    for (const name of revisions) if (retained.size < 3) retained.add(name)
    for (const name of revisions) if (!retained.has(name)) fs.rmSync(path.join(root, name), { recursive: true, force: true })
    // Browsers holding a retained revision's manifest still download its parts.
    const named = new Set([...retained].flatMap((name) => manifestParts(path.join(root, name))))
    if (fs.existsSync(assetDirectory))
      for (const file of fs.readdirSync(assetDirectory)) if (!named.has(file)) fs.rmSync(path.join(assetDirectory, file))
    const pointer = path.join(root, 'current.json.incoming')
    fs.writeFileSync(pointer, JSON.stringify({ id }))
    fs.renameSync(pointer, path.join(root, 'current.json'))
    return true
  } finally {
    if (staging) fs.rmSync(staging, { recursive: true, force: true })
    lock.close()
  }
}
