import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { liveCatalogueRevision } from '../../src/server/liveCatalogue'
import { replaceDirectory } from '../../src/server/replaceDirectory'

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
    for (const file of ['catalogue/revision.json', 'runtime/manifest.json', 'public/offline-reference-version.json'])
      if (!fs.statSync(path.join(staging, file), { throwIfNoEntry: false })?.isFile()) throw new Error(`Incomplete catalogue: ${file}`)
    const target = path.join(root, id)
    const assets = path.join(staging, 'public/assets')
    if (fs.existsSync(assets)) {
      fs.cpSync(assets, path.join(root, 'assets'), { recursive: true })
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
    const assetDirectory = path.join(root, 'assets')
    if (fs.existsSync(assetDirectory)) {
      const files = fs
        .readdirSync(assetDirectory)
        .sort((left, right) => fs.statSync(path.join(assetDirectory, right)).mtimeMs - fs.statSync(path.join(assetDirectory, left)).mtimeMs)
      for (const file of files.slice(128)) fs.rmSync(path.join(assetDirectory, file))
    }
    const pointer = path.join(root, 'current.json.incoming')
    fs.writeFileSync(pointer, JSON.stringify({ id }))
    fs.renameSync(pointer, path.join(root, 'current.json'))
    return true
  } finally {
    if (staging) fs.rmSync(staging, { recursive: true, force: true })
    lock.close()
  }
}
